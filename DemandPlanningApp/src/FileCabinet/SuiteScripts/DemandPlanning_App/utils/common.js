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

        function standardizeDataset(itemId, itemName, rawInventory, rawForecast, rawOLT, rawInbound) {

            const months = rawForecast.map(r => normalizeMonth(r.salesmonth));
            const quantities = rawForecast.map(r => Number(r.qtysold));
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
            standardizeDataset: standardizeDataset,
            unitPerDay: unitPerDay,
            calculateSafetyStock: calculateSafetyStock,
            calculateReorderPoint: calculateReorderPoint,
            calculateSuggestedOrderQty: calculateSuggestedOrderQty
        };

    });