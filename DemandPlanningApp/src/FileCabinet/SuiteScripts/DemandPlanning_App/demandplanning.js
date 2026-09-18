/**
 * demandplanning.js
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @NScriptType CustomTool
 */

define([
    '/SuiteScripts/DemandPlanning_App/utils/suiteQL',
    '/SuiteScripts/DemandPlanning_App/utils/common',
    '/SuiteScripts/DemandPlanning_App/utils/weeklyProjection'
], function (SQL, _, weeklyProjection) {

    /**
     * Load all raw demand-planning data exactly once and standardize it.
     * This is intentionally private so higher-level calculations can share
     * the same dataset instead of recursively invoking public tools.
     */
    async function loadStandardDataset(itemId, itemName) {
        const [itemBalance, itemQtyOnOrder, forecast, olt, inbound] = await Promise.all([
            _.runQuery(SQL.itemBalanceByLocation.itemBalance, [itemId]),
            _.runQuery(SQL.itemBalanceByLocation.itemOnOrder, [itemId]),
            _.runQuery(SQL.forecast.monthlySales, [itemId]),
            _.runQuery(SQL.avgReceiveItemTwoYearsHistory, [itemId]),
            _.runQuery(SQL.inboundShipments(itemId), [itemId])
        ]);

        const merged = {};

        itemBalance.forEach(row => {
            merged[row.locationname] = {
                locationName: row.locationname,
                quantityOnHand: row.quantityonhand,
                committedQty: row.committedqtyperlocation,
                onOrderQty: 0
            };
        });

        itemQtyOnOrder.forEach(row => {
            if (!merged[row.locationname]) {
                merged[row.locationname] = {
                    locationName: row.locationname,
                    quantityOnHand: 0,
                    committedQty: 0,
                    onOrderQty: 0
                };
            }
            merged[row.locationname].onOrderQty = row.onorderqty;
        });

        const inventory = { locations: Object.values(merged) };
        const inboundShipments = { shipments: inbound };

        return _.standardizeDataset(itemId, itemName, inventory, forecast, olt, inboundShipments);
    }

    /**
     * Pure calculation: no SuiteQL/database access.
     */
    function calculateReorderPoint(itemId, standardData) {
        const monthlyDemand = standardData.salesHistory.averageMonthlyDemand;
        const avgOLT = standardData.leadTime.averageDays;
        const dailyUsage = _.unitPerDay(monthlyDemand);

        const safetyStock = _.calculateSafetyStock(dailyUsage, avgOLT);
        const reorderPointValue = _.calculateReorderPoint(monthlyDemand, safetyStock);

        const totals = standardData.inventory.totals;
        const suggestedOrderQty = _.calculateSuggestedOrderQty(
            reorderPointValue, totals.onHand, totals.onOrder, totals.committed
        );

        return {
            itemId: itemId,
            monthlyDemand: monthlyDemand,
            dailyUsage: dailyUsage,
            averageOLT: avgOLT,
            safetyStock: safetyStock,
            reorderPoint: reorderPointValue,
            currentOnHand: totals.onHand,
            currentOnOrder: totals.onOrder,
            currentCommitted: totals.committed,
            currentAvailable: totals.onHand + totals.onOrder - totals.committed,
            suggestedOrderQty: suggestedOrderQty
        };
    }

    /**
     * Pure calculation: no SuiteQL/database access.
     */
    function calculateWeeklyProjection(itemId, standardData, reorderData, numberOfWeeks) {
        const today = new Date();
        const inboundShipments = standardData.inboundShipments.shipments;
        const onHandToday = standardData.inventory.totals.onHand;
        const weeklyDemand = reorderData.dailyUsage * 7;

        const projection = weeklyProjection.projectInventory(
            onHandToday, weeklyDemand, inboundShipments, numberOfWeeks, today
        );

        const decisionPoint = weeklyProjection.calculateAmountNeeded(
            projection, reorderData.reorderPoint, reorderData.averageOLT
        );

        return {
            itemId: itemId,
            asOfDate: today.toISOString().slice(0, 10),
            weeksProjected: numberOfWeeks,
            inputs: {
                onHandToday: onHandToday,
                weeklyDemand: weeklyDemand,
                reorderPoint: reorderData.reorderPoint,
                averageOLT: reorderData.averageOLT
            },
            projection: projection,
            decisionPoint: decisionPoint
        };
    }

    return {

        ns_demandPlanView: async function (params) {
            return { itemId: params.itemId || null };
        },

        /**
        * Batch endpoint: runs the full demand plan (reorder point + weekly
        * projection) for a list of items in a single call. Designed to be
        * called repeatedly by the AI client in small groups (e.g. 10 at a
        * time) rather than for the entire demand-planning item list at once,
        * to avoid governance/timeout issues on large lists.
        */
        ns_getBatchDemandPlan: async function (params) {
            try {
                const items = typeof params.items === 'string'
                    ? JSON.parse(params.items)
                    : (params.items || []);
                const numberOfWeeks = params.weeksAhead || 27;

                if (items.length === 0) {
                    return { processed: 0, itemsNeedingOrder: 0, items: [] };
                }

                const results = [];

                for (const item of items) {
                    try {
                        const standardData = await loadStandardDataset(item.itemId, item.itemName);
                        const reorderData = calculateReorderPoint(item.itemId, standardData);
                        const weeklyProjectionData = calculateWeeklyProjection(
                            item.itemId, standardData, reorderData, numberOfWeeks
                        );

                        results.push({
                            itemId: item.itemId,
                            itemName: item.itemName,
                            dailyUsage: reorderData.dailyUsage,
                            onHand: standardData.inventory.totals.onHand,
                            reorderPoint: reorderData.reorderPoint,
                            currentAvailable: reorderData.currentAvailable,
                            suggestedOrderQty: weeklyProjectionData.decisionPoint.suggestedOrderQty,
                            status: weeklyProjectionData.decisionPoint.suggestedOrderQty > 0 ? 'NEEDS ORDER' : 'OK',
                            weeklyBalance: weeklyProjectionData.projection.map(p => ({
                                week: p.week,
                                weekStart: p.weekStart,
                                balance: p.balance
                            }))
                        });
                    } catch (itemError) {
                        log.error('Error processing item ' + item.itemId, itemError);
                        results.push({ itemId: item.itemId, itemName: item.itemName, error: true });
                    }
                }

                return {
                    processed: results.length,
                    itemsNeedingOrder: results.filter(r => r.status === 'NEEDS ORDER').length,
                    items: results
                };

            } catch (error) {
                log.error('Error running batch demand plan', error);
                throw error;
            }
        },

        ns_getDemandPlanningItemList: async function () {
            try {
                const rawResult = await _.runQuery(SQL.demandPlanningItemList, []);
                const itemIds = _.parseItemIdList(rawResult);

                if (itemIds.length === 0) return { totalItems: 0, items: [] };

                const itemIdsArray = itemIds.join(',');
                const itemsWithNames = await _.runQuery(SQL.demandPlanningItemListWithName(itemIdsArray), []);

                return {
                    totalItems: itemsWithNames.length,
                    items: itemsWithNames.map(item => ({
                        itemId: item.id,
                        itemName: item.itemname
                    }))
                };
            } catch (error) {
                log.error('Error fetching demand planning item list', error);
                throw error;
            }
        },

        /**
         * Consolidated endpoint for the demand-plan UI.
         * Executes the five underlying SuiteQL queries once, then derives
         * reorder point and weekly projection entirely in memory.
         */
        ns_getDemandPlan: async function (params) {
            try {
                const itemId = params.itemId;
                const numberOfWeeks = params.weeksAhead || 27;

                const standardData = await loadStandardDataset(itemId, params.itemName);
                const reorderData = calculateReorderPoint(itemId, standardData);
                const weeklyProjectionData = calculateWeeklyProjection(
                    itemId, standardData, reorderData, numberOfWeeks
                );

                return {
                    itemId: itemId,
                    standardData: standardData,
                    reorderData: reorderData,
                    weeklyProjection: weeklyProjectionData
                };
            } catch (error) {
                log.error('Error calculating demand plan', error);
                throw error;
            }
        },

        ns_getWeeklyProjection: async function (params) {
            try {
                const itemId = params.itemId;
                const numberOfWeeks = params.weeksAhead || 27;
                const standardData = await loadStandardDataset(itemId, params.itemName);
                const reorderData = calculateReorderPoint(itemId, standardData);

                return calculateWeeklyProjection(itemId, standardData, reorderData, numberOfWeeks);
            } catch (error) {
                log.error('Error calculating weekly projection', error);
                throw error;
            }
        },

        ns_getReorderPoint: async function (params) {
            try {
                const itemId = params.itemId;
                const standardData = await loadStandardDataset(itemId, params.itemName);

                return calculateReorderPoint(itemId, standardData);
            } catch (error) {
                log.error('Error calculating reorder point', error);
                throw error;
            }
        },

        ns_getStandardDataset: async function (params) {
            try {
                return await loadStandardDataset(params.itemId, params.itemName);
            } catch (error) {
                log.error('Error occurred while fetching standard dataset', error);
                throw error;
            }
        },

        ns_inboundShipment: async function (params) {
            try {
                const itemId = params.itemId || null;

                const sql = SQL.inboundShipments(itemId);
                const queryParams = itemId ? [itemId] : [];

                const inboundShipments = await _.runQuery(sql, queryParams);
                return { shipments: inboundShipments };
            } catch (error) {
                log.error('Error occurred while fetching inbound shipments', error);
                throw error;
            }
        },

        ns_inventoryBalace: async function (params) {
            try {
                const itemBalance = await _.runQuery(SQL.itemBalanceByLocation.itemBalance, [params.itemId]);
                const itemQtyOnOrder = await _.runQuery(SQL.itemBalanceByLocation.itemOnOrder, [params.itemId]);

                const merged = {};

                itemBalance.forEach(row => {
                    merged[row.locationname] = {
                        locationName: row.locationname,
                        quantityOnHand: row.quantityonhand,
                        committedQty: row.committedqtyperlocation,
                        onOrderQty: 0
                    };
                });

                itemQtyOnOrder.forEach(row => {
                    if (!merged[row.locationname]) {
                        merged[row.locationname] = {
                            locationName: row.locationname,
                            quantityOnHand: 0,
                            committedQty: 0,
                            onOrderQty: 0
                        };
                    }
                    merged[row.locationname].onOrderQty = row.onorderqty;
                });

                return { locations: Object.values(merged) };
            } catch (error) {
                log.error('Error occurred while fetching inventory balance', error);
                throw error;
            }
        },

        ns_forecast: async function (params) {
            try {
                const salesHistory = await _.runQuery(SQL.forecast.monthlySales, [params.itemId]);

                return salesHistory;
            } catch (error) {
                log.error('Error occurred while fetching forecast', error);
                throw error;
            }
        },

        ns_OLT: async function (params) {
            try {
                const oltData = await _.runQuery(SQL.avgReceiveItemTwoYearsHistory, [params.itemId]);
                return oltData;
            } catch (error) {
                log.error('Error occurred while fetching OLT data', error);
                throw error;
            }
        }
    };
});
