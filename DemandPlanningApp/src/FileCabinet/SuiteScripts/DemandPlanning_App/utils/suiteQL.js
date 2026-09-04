/**
 * @NApiVersion 2.1
 */
define(['N/query'],
    /**
 * @param{query} query
 */
    (query) => {

        return {
            defaultItems: `
                SELECT id internalId, itemId name, description
                FROM item 
                WHERE (itemId LIKE 'MM%' OR itemId LIKE 'SB%')
                AND isInactive = 'F';`,
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
                        SUM(tl.quantity - NVL(tl.quantityshiprecv, 0)) AS onOrderQty
                    FROM transaction t
                    JOIN transactionline tl ON tl.transaction = t.id
                    JOIN item i ON i.id = tl.item
                    JOIN location l ON tl.location = l.id
                    WHERE t.type = 'PurchOrd'
                      AND tl.mainline = 'F'
                      AND tl.item = ?
                      AND tl.quantity != tl.quantityShipRecv
                      AND t.status NOT IN ('Purchase Order:Closed', 'Purchase Order:Fully Billed')
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
                    WHERE ist.shipmentStatus = 'toBeShipped'
                    ${itemId ? ` AND tl.item = ?` : ''}`)
        };

    });