/**
* salesorders.js
* @NApiVersion 2.1
* @NModuleScope Public
* @NScriptType CustomTool
*/

define(['N/record', 'N/log'], function (record, log) {
    return {
        createSalesOrder: async function (params) {
            const { entity, otherrefnum, itemIds, quantities } = params;

            if (!entity || !otherrefnum || !itemIds || !quantities) {
                return { result: "", error: "Missing required parameters: entity, otherrefnum, itemIds, or quantities" };
            }

            const itemIdList = itemIds.split(',').map(s => s.trim()).filter(Boolean);
            const quantityList = quantities.split(',').map(s => Number(s.trim()));

            if (itemIdList.length === 0 || itemIdList.length !== quantityList.length) {
                return { result: "", error: "itemIds and quantities must be non-empty and the same length" };
            }
            if (quantityList.some(q => isNaN(q) || q <= 0)) {
                return { result: "", error: "All quantities must be positive numbers" };
            }

            const items = itemIdList.map((itemId, i) => ({
                itemId, quantity: quantityList[i] 
            }));
            log.debug({
                    title: "Creating Sales Order",
                    details: `Entity: ${entity}, Other Ref Num: ${otherrefnum}, Items: ${JSON.stringify(items)}`
                });
                try {

                    const salesOrder = await record.create.promise({
                        type: record.Type.SALES_ORDER,
                        isDynamic: true,
                    });

                    salesOrder.setValue({
                        fieldId: 'entity',
                        value: entity,
                    });

                    salesOrder.setValue({
                        fieldId: 'otherrefnum',
                        value: otherrefnum,
                    });

                    for(const item of items) {
                        salesOrder.selectNewLine({
                            sublistId: 'item',
                        });

                        salesOrder.setCurrentSublistValue({
                            sublistId: 'item',
                            fieldId: 'item',
                            value: item.itemId,
                        });
                        salesOrder.setCurrentSublistValue({
                            sublistId: 'item',
                            fieldId: 'quantity',
                            value: item.quantity,
                        });

                        salesOrder.commitLine({ sublistId: 'item' });
                    }

                const salesOrderId = await salesOrder.save.promise();

                    return {
                        result: salesOrderId,
                        error: null
                    };
                } catch(e) {
                    log.error({
                        title: "Error creating sales order",
                        details: e
                    });
                    return {
                        result: e.message,
                        error: "There was an error creating the sales order: " + e
                    }
                }
            },
    }
    }); 