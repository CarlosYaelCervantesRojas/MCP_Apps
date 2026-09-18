/**
 * @NApiVersion 2.1
 */
define(['N/query'],
    /**
 * @param{query} query
 */
    (query) => {

        return {
            demandPlanningItemList: `
                SELECT custrecord_items_include_dp 
                FROM customrecord_demmand_planning_items 
                WHERE recordid = 1;`,
            demandPlanningItemListWithName: (itemIds) => (`
                SELECT id, itemid AS itemName FROM item WHERE id IN (${itemIds})
                `),
            locations: `
                SELECT id internalId, name
                FROM location 
                WHERE isInactive = 'F';`,
            itemBalanceByLocation: {
                itemBalance: `
                    SELECT
                        i.itemId AS itemName,
                        l.name AS locationname,
                        SUM(lib.quantityOnHand) AS quantityonhand,
                        MAX(lib.committedQtyPerLocation) AS committedqtyperlocation
                    FROM LocationInventoryBalance lib
                    JOIN location l ON l.id = lib.location
                    JOIN item i ON i.id = lib.item
                    WHERE i.id = ?
                    GROUP BY i.itemId, l.name`,
                itemOnOrder: `
                    SELECT
                        l.id AS locationId,
                        l.name AS locationName,
                        SUM(
                            NVL(tl.quantity, 0) -
                            NVL(tl.quantityShipRecv, 0)
                        ) AS onOrderQty
                    FROM transaction t
                    JOIN transactionline tl ON tl.transaction = t.id
                    JOIN location l ON tl.location = l.id
                    WHERE t.type = 'PurchOrd'
                      AND tl.mainline = 'F'
                      AND tl.item = ?
                      AND NVL(tl.isclosed, 'F') = 'F'
                      AND (
                          NVL(tl.quantity, 0) -
                          NVL(tl.quantityShipRecv, 0)
                      ) > 0
                    GROUP BY l.id, l.name;`,
            },
            forecast: {
                monthlySales: `
                    SELECT 
                        tl.item,
                        TRUNC(t.trandate, 'MM') AS salesmonth,
                        SUM(-tl.quantity) AS qtysold
                    FROM transaction t
                    JOIN transactionline tl ON tl.transaction = t.id
                    WHERE t.type = 'CustInvc'
                      AND tl.mainline = 'F'
                      AND tl.item = ?
                      AND t.voided = 'F'
                      AND t.trandate >= ADD_MONTHS(TRUNC(SYSDATE, 'MM'), -24)
                      AND t.trandate < TRUNC(SYSDATE, 'MM')
                    GROUP BY tl.item, TRUNC(t.trandate, 'MM')
                    ORDER BY salesmonth`
            },
            inboundShipments: (itemId) => (`
                    SELECT 
                    	ist.id, 
                    	tl.transaction,
                    	tl.item,
                    	isi.shipmentItemDescription,
                    	isi.quantityExpected, 
                    	ist.shipmentnumber, 
                    	ist.shipmentStatus, 
                    	ist.shipmentCreatedDate, 
                    	ist.custrecord_invoice_number_inbound, 
                    	ist.expectedShippingDate, 
                    	ist.expectedDeliveryDate, 
                    	(isi.quantityExpected - isi.quantityReceived) AS quantityRemaining,
                    	isi.receivingLocation
                    FROM InboundShipment ist
                    JOIN InboundShipmentItem isi ON ist.id = isi.inboundShipment 
                    JOIN transactionLine tl ON tl.uniquekey = isi.shipmentItemTransaction
                    WHERE ist.shipmentStatus IN (
                        'toBeShipped',
                        'inTransit',
                        'partiallyReceived'
                    )
                    AND (
                        NVL(isi.quantityExpected, 0) -
                        NVL(isi.quantityReceived, 0)
                    ) > 0
                    ${itemId ? ` AND tl.item = ?` : ''}`),
            avgReceiveItemTwoYearsHistory: `
                SELECT
                    BUILTIN.DF(pol.item) AS item,
                    TO_CHAR(po.trandate, 'YYYY-MM') AS order_month,
                    ROUND(
                        AVG(
                            full_receipt.full_receipt_date - po.trandate
                        ),
                        1
                    ) AS avg_days_to_receive
                FROM
                    Transaction po
                INNER JOIN
                    TransactionLine pol
                        ON pol.transaction = po.id
                        AND pol.mainline = 'F'
                        AND pol.item IS NOT NULL
                INNER JOIN (
                    SELECT
                        irl.createdfrom AS po_id,
                        irl.item        AS item,
                        MAX(ir.trandate) AS full_receipt_date,
                        SUM(ABS(irl.quantity)) AS total_received_qty
                    FROM
                        Transaction ir
                    INNER JOIN
                        TransactionLine irl
                            ON irl.transaction = ir.id
                            AND irl.mainline = 'F'
                            AND irl.item IS NOT NULL
                    WHERE
                        ir.type = 'ItemRcpt'
                    GROUP BY
                        irl.createdfrom,
                        irl.item
                ) full_receipt
                    ON full_receipt.po_id = po.id
                    AND full_receipt.item = pol.item
                WHERE
                    po.type = 'PurchOrd'
                    AND po.trandate >= ADD_MONTHS(TRUNC(SYSDATE), -24)
                    /*
                     * Only include PO lines where the full ordered
                     * quantity has been received.
                     */
                    AND full_receipt.total_received_qty >= ABS(pol.quantity)
                	AND pol.item = ?
                GROUP BY
                    pol.item,
                    BUILTIN.DF(pol.item),
                    TO_CHAR(po.trandate, 'YYYY-MM')
                ORDER BY
                    BUILTIN.DF(pol.item),
                    TO_CHAR(po.trandate, 'YYYY-MM')`
        }
    });