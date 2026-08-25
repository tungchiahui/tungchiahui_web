import { existsSync } from 'node:fs'
import { loadEnvFile } from 'node:process'

import { S3ObjectStorageAdapter } from '../../src/storage/s3-adapter'
import { runStorageContract } from './contract'
import { parseS3ContractConfiguration } from './s3-contract-configuration'

export async function runExternalS3ContractFromEnvironment() {
  if (existsSync('.env.local')) loadEnvFile('.env.local')
  const configuration = parseS3ContractConfiguration(process.env)
  const storage = new S3ObjectStorageAdapter(configuration.connection)
  try {
    const report = await runStorageContract(storage, { cdnBaseUrl: configuration.cdnBaseUrl })
    console.log(
      JSON.stringify(
        {
          ...report,
          bucket: configuration.connection.bucket,
          endpointOrigin: configuration.connection.endpoint.origin,
        },
        null,
        2,
      ),
    )
  } finally {
    storage.destroy()
  }
}
