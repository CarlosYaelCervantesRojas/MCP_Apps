/**
 * demandplanning.js
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @NScriptType CustomTool
 */

define(['/SuiteScripts/DemandPlanning_App/utils/suiteQL', '/SuiteScripts/DemandPlanning_App/utils/common'], function (SQL, _) {

    return {

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
                const monthsAhead = params.monthsAhead || 12;
                const forecastQty = _.forecastNextMonths(salesHistory, monthsAhead);

                return {
                    itemId: params.itemId,
                    historyMonths: _.buildMonthlySeries(salesHistory),
                    forecastMonths: forecastQty.map(qty => Math.round(qty))
                }
            } catch (error) {
                log.error('Error occurred while fetching forecast', error);
                throw error;
            }
        }
    };
});