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
                itemOnOrderByLocation: `
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
            }
        };

    });