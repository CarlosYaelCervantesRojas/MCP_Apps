/**
 * lookup.js
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @NScriptType CustomTool
 */

define(['N/query', 'N/log'], function (query, log) {

    // Escape single quotes for safe inline SuiteQL string literals
    function escapeSql(value) {
        return String(value).replace(/'/g, "''");
    }

    return {
        findCustomer: async function (params) {
            const { name, limit } = params;
            const maxResults = limit && limit > 0 && limit <= 20 ? limit : 5;

            if (!name || !name.trim()) {
                return { result: [], error: "Missing required parameter: name" };
            }

            const searchTerm = escapeSql(name.trim());

            const sql = `
                SELECT
                    id,
                    entityid,
                    companyname,
                    firstname,
                    lastname,
                    isperson,
                    CASE
                        WHEN isperson = 'T'
                             AND LOWER(firstname || ' ' || lastname) = LOWER('${searchTerm}') THEN 0
                        WHEN isperson = 'F'
                             AND LOWER(companyname) = LOWER('${searchTerm}') THEN 0
                        WHEN isperson = 'T'
                             AND LOWER(firstname || ' ' || lastname) LIKE LOWER('${searchTerm}%') THEN 1
                        WHEN isperson = 'F'
                             AND LOWER(companyname) LIKE LOWER('${searchTerm}%') THEN 1
                        ELSE 2
                    END AS match_rank
                FROM customer
                WHERE isinactive = 'F'
                  AND (
                        LOWER(entityid) LIKE LOWER('%${searchTerm}%')
                     OR LOWER(companyname) LIKE LOWER('%${searchTerm}%')
                     OR LOWER(firstname || ' ' || lastname) LIKE LOWER('%${searchTerm}%')
                     OR LOWER(lastname || ', ' || firstname) LIKE LOWER('%${searchTerm}%')
                  )
                ORDER BY match_rank ASC, entityid ASC
                FETCH FIRST ${maxResults} ROWS ONLY
            `;

            try {
                const resultSet = await query.runSuiteQL.promise({ query: sql });
                const rows = resultSet.asMappedResults();

                const matches = rows.map(function (row) {
                    const displayName = row.isperson === 'T'
                        ? [row.firstname, row.lastname].filter(Boolean).join(' ')
                        : row.companyname;

                    return {
                        id: row.id,
                        name: displayName || row.entityid,
                        entityId: row.entityid,
                        exactMatch: row.match_rank === 0
                    };
                });

                return {
                    result: matches,
                    error: matches.length === 0 ? "No matching customers found" : null
                };
            } catch (e) {
                log.error({ title: 'findCustomer error', details: e.message });
                return { result: [], error: "Error searching for customer: " + e.message };
            }
        },

        findItem: async function (params) {
            const { search, limit } = params;
            const maxResults = limit && limit > 0 && limit <= 20 ? limit : 5;

            if (!search || !search.trim()) {
                return { result: [], error: "Missing required parameter: search" };
            }

            const searchTerm = escapeSql(search.trim());

            const sql = `
                SELECT
                    id,
                    itemid,
                    displayname,
                    CASE
                        WHEN LOWER(itemid) = LOWER('${searchTerm}') THEN 0
                        WHEN LOWER(displayname) = LOWER('${searchTerm}') THEN 0
                        WHEN LOWER(itemid) LIKE LOWER('${searchTerm}%') THEN 1
                        WHEN LOWER(displayname) LIKE LOWER('${searchTerm}%') THEN 1
                        ELSE 2
                    END AS match_rank
                FROM inventoryitem
                WHERE isinactive = 'F'
                  AND (
                        LOWER(itemid) LIKE LOWER('%${searchTerm}%')
                     OR LOWER(displayname) LIKE LOWER('%${searchTerm}%')
                  )
                ORDER BY match_rank ASC, itemid ASC
                FETCH FIRST ${maxResults} ROWS ONLY
            `;

            try {
                const resultSet = await query.runSuiteQL.promise({ query: sql });
                const rows = resultSet.asMappedResults();

                const matches = rows.map(function (row) {
                    return {
                        id: row.id,
                        sku: row.itemid,
                        name: row.displayname,
                        exactMatch: row.match_rank === 0
                    };
                });

                return {
                    result: matches,
                    error: matches.length === 0 ? "No matching items found" : null
                };
            } catch (e) {
                log.error({ title: 'findItem error', details: e.message });
                return { result: [], error: "Error searching for item: " + e.message };
            }
        }
    };
});