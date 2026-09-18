/**
 * @NApiVersion 2.1
 */
define(['N/query'],
    /**
 * @param{query} query
 */
    (query) => {

        const runQuery = async (queryString, params) => {
            try {
                const resultSet = await query.runSuiteQL.promise({
                    query: queryString,
                    params: params || []
                });
                const rows = resultSet.asMappedResults();
                log.debug('Query Results', JSON.stringify(rows));
                return rows;
            } catch (error) {
                log.error('Error running query', error);
                throw error;
            }
        }

        const parseItemIdList = (rawResult) => {
            if (!rawResult || rawResult.length === 0) return [];
            const raw = rawResult[0].custrecord_items_include_dp;
            if (!raw) return [];
            return raw.split(',').map(id => id.trim()).filter(id => id).map(id => Number(id));
        }

        function standardizeDataset(itemId, itemName, rawInventory, rawForecast, rawOLT, rawInbound) {

            // The SQL returns the previous 24 complete calendar months.
            // Missing months must count as zero demand; otherwise the average
            // would be calculated only over months in which the item sold.
            const monthlySales = new Map(
                rawForecast.map(r => [
                    normalizeMonth(r.salesmonth),
                    Number(r.qtysold) || 0
                ])
            );

            const completeMonths = getPreviousCompleteMonths(24);
            const months = completeMonths.map(month => month.key);
            const quantities = completeMonths.map(month =>
                monthlySales.get(month.key) || 0
            );
            const averageMonthlyDemand = average(quantities);

            const leadTimeMonthly = rawOLT.map(r => ({
                month: r.order_month,
                avgDays: Number(r.avg_days_to_receive)
            }));
            const averageLeadTimeDays = average(leadTimeMonthly.map(r => r.avgDays));

            const locations = rawInventory.locations.map(loc => ({
                locationName: loc.locationName,
                quantityOnHand: Number(loc.quantityOnHand),
                committedQty: Number(loc.committedQty),
                onOrderQty: Number(loc.onOrderQty)
            }));

            const totals = locations.reduce((acc, loc) => {
                acc.onHand += loc.quantityOnHand;
                acc.committed += loc.committedQty;
                acc.onOrder += loc.onOrderQty;
                return acc;
            }, { onHand: 0, committed: 0, onOrder: 0 });

            const shipments = (rawInbound.shipments || []).map(s => ({
                shipmentNumber: s.shipmentnumber,
                status: s.shipmentstatus,
                expectedDeliveryDate: s.expecteddeliverydate,
                quantityRemaining: Number(s.quantityremaining)
            }));

            const totalQtyRemaining = shipments.reduce((sum, s) => sum + s.quantityRemaining, 0);

            return {
                itemId: itemId,
                itemName: itemName,
                generatedAt: new Date().toISOString().slice(0, 10),
                salesHistory: {
                    months: months,
                    quantities: quantities,
                    averageMonthlyDemand: averageMonthlyDemand
                },
                leadTime: {
                    monthly: leadTimeMonthly,
                    averageDays: averageLeadTimeDays
                },
                inventory: {
                    locations: locations,
                    totals: totals
                },
                inboundShipments: {
                    count: shipments.length,
                    totalQtyRemaining: totalQtyRemaining,
                    shipments: shipments
                }
            };
        }

        function getPreviousCompleteMonths(count) {
            const result = [];
            const now = new Date();
            const currentMonthStart = new Date(
                now.getFullYear(),
                now.getMonth(),
                1
            );

            for (let i = count; i >= 1; i--) {
                const date = new Date(
                    currentMonthStart.getFullYear(),
                    currentMonthStart.getMonth() - i,
                    1
                );
                const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                result.push({ key: key });
            }

            return result;
        }

        function normalizeMonth(dateStr) {
            const d = new Date(dateStr);
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        }

        function average(arr) {
            if (!arr || arr.length === 0) return 0;
            return arr.reduce((a, b) => a + b, 0) / arr.length;
        }



        function unitPerDay(monthlyDemand) {
            return monthlyDemand / 30;
        }

        function calculateSafetyStock(dailyUsage, avgOLT) {
            return (dailyUsage * avgOLT) / 2;
        }

        function calculateReorderPoint(monthlyDemand, safetyStock) {
            return monthlyDemand + safetyStock;
        }

        function calculateSuggestedOrderQty(reorderPoint, onHand, onOrder, committed) {
            const available = onHand + onOrder - committed;
            return Math.max(reorderPoint - available, 0);
        }
        
        return {
            runQuery: runQuery,
            parseItemIdList: parseItemIdList,
            standardizeDataset: standardizeDataset,
            unitPerDay: unitPerDay,
            calculateSafetyStock: calculateSafetyStock,
            calculateReorderPoint: calculateReorderPoint,
            calculateSuggestedOrderQty: calculateSuggestedOrderQty
        };

    });