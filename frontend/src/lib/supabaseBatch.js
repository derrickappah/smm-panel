import { supabase } from './supabase';

/**
 * Batch multiple Supabase queries together for parallel execution
 * This reduces round trips and improves performance
 * 
 * @param {Array<Function>} queries - Array of async functions that return Supabase queries
 * @returns {Promise<Array>} Array of results in the same order as queries
 * 
 * @example
 * const [users, orders, transactions] = await batchQueries([
 *   () => supabase.from('profiles').select('*'),
 *   () => supabase.from('orders').select('*'),
 *   () => supabase.from('transactions').select('*')
 * ]);
 */
export const batchQueries = async (queries) => {
  if (!Array.isArray(queries) || queries.length === 0) {
    return [];
  }

  // Execute all queries in parallel
  const results = await Promise.all(
    queries.map(async (queryFn) => {
      try {
        const result = await queryFn();
        return result;
      } catch (error) {
        // Return error in consistent format
        return { data: null, error, count: 0 };
      }
    })
  );

  return results;
};

/**
 * Batch multiple Supabase queries and extract only data (ignoring errors)
 * Useful when you want to continue even if some queries fail
 * 
 * @param {Array<Function>} queries - Array of async functions that return Supabase queries
 * @returns {Promise<Array>} Array of data arrays (null for failed queries)
 */
export const batchQueriesData = async (queries) => {
  const results = await batchQueries(queries);
  return results.map(result => result.data || null);
};

/**
 * Batch multiple Supabase queries and throw if any fail
 * Useful when all queries must succeed
 * 
 * @param {Array<Function>} queries - Array of async functions that return Supabase queries
 * @returns {Promise<Array>} Array of data arrays
 * @throws {Error} If any query fails
 */
export const batchQueriesStrict = async (queries) => {
  const results = await batchQueries(queries);
  
  // Check for errors
  const errors = results
    .map((result, index) => result.error ? { index, error: result.error } : null)
    .filter(Boolean);
  
  if (errors.length > 0) {
    throw new Error(`Batch query failed: ${errors.map(e => e.error.message).join(', ')}`);
  }
  
  return results.map(result => result.data);
};

