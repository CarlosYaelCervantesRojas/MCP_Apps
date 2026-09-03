/**
 * demandplanning.js
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @NScriptType CustomTool
 */

define(['/SuiteScripts/DemandPlanning_App/utils/suiteQL', '/SuiteScripts/DemandPlanning_App/utils/common'], function (SQL, _) {

    return {
        ns_inventoryBalace: async function (params) {
            try {
                const itemBalance = await _.runQuery(SQL.itemBalanceByLocation.itemBalance, [params.itemId]);
                const itemQtyOnOrder = await _.runQuery(SQL.itemBalanceByLocation.itemOnOrderByLocation, [params.itemId]);

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
        }
    };
});