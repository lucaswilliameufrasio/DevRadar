import Knex, { type Knex as KnexType } from 'knex';

import { knexConfig } from 'knexfile';
import { logger } from './logger';

function createKnexInstance(
  config: Knex.Knex.Config<any>,
): Knex.Knex<any, unknown[]> {
  try {
    return Knex(config);
  } catch (error) {
    logger.error('Failed to create knex instance', error);
    throw error;
  }
}

export const knex = createKnexInstance(knexConfig);

// The builtin method can not be used due
// to a problem with the generated DDL
// when the table exists. Knex will warn
// you about it being removed from documentation
// https://github.com/knex/knex/issues/1303
export async function createTableIfNotExists(
  knex: KnexType,
  tableName: string,
  callback: (tableBuilder: KnexType.CreateTableBuilder) => unknown,
): Promise<void> {
  const tableExist = await knex.schema.hasTable(tableName);

  if (tableExist) {
    return;
  }

  await knex.schema.createTable(tableName, callback);
}
