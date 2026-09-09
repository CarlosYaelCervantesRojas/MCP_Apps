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

    return {

        ns_demandPlanView: async function (params) {
            return { itemId: params.itemId || null };
        },

        ns_getWeeklyProjection: async function (params) {
            try {
                const itemId = params.itemId;
                const numberOfWeeks = params.weeksAhead || 27;

                const [standardData, reorderData] = await Promise.all([
                    this.ns_getStandardDataset({ itemId: itemId }),
                    this.ns_getReorderPoint({ itemId: itemId })
                ]);

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

            } catch (error) {
                log.error('Error calculating weekly projection', error);
                throw error;
            }
        },


        ns_getReorderPoint: async function (params) {
            try {
                const itemId = params.itemId;

                const standardData = await this.ns_getStandardDataset({ itemId: itemId });

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

            } catch (error) {
                log.error('Error calculating reorder point', error);
                throw error;
            }
        },

        ns_getStandardDataset: async function (params) {
            try {
                const itemId = params.itemId;

                const [inventory, forecast, olt, inbound] = await Promise.all([
                    this.ns_inventoryBalace({ itemId: itemId }),
                    this.ns_forecast({ itemId: itemId }),
                    this.ns_OLT({ itemId: itemId }),
                    this.ns_inboundShipment({ itemId: itemId })
                ]);

                return _.standardizeDataset(itemId, params.itemName, inventory, forecast, olt, inbound);
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