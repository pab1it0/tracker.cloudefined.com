import { MongoClient, type Collection, type Document } from 'mongodb'
import type { Env } from './env.js'

// Cached on globalThis so warm serverless invocations and Vite HMR reuse the connection.
const globalForMongo = globalThis as unknown as { __trackerMongoClient?: MongoClient }

function getClient(env: Env): MongoClient {
  if (!globalForMongo.__trackerMongoClient) {
    globalForMongo.__trackerMongoClient = new MongoClient(env.mongodbUri, {
      maxPoolSize: 5,
      minPoolSize: 0,
      serverSelectionTimeoutMS: 8000,
      connectTimeoutMS: 8000,
      appName: 'tracker',
      retryReads: true,
    })
  }
  return globalForMongo.__trackerMongoClient
}

export function getCollection(env: Env): Collection<Document> {
  return getClient(env).db(env.mongodbDb).collection(env.mongodbCollection)
}

export function getRoutesView(env: Env): Collection<Document> {
  return getClient(env).db(env.mongodbDb).collection(env.mongodbRoutesView)
}

export function getModesCollection(env: Env): Collection<Document> {
  return getClient(env).db(env.mongodbDb).collection(env.mongodbModesCollection)
}

export function getPhotosCollection(env: Env): Collection<Document> {
  return getClient(env).db(env.mongodbDb).collection(env.mongodbPhotosCollection)
}
