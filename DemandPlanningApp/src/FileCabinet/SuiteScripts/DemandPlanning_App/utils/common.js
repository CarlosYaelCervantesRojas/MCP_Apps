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
                return [];
            }
        }

        return {
            runQuery: runQuery
        };

    });