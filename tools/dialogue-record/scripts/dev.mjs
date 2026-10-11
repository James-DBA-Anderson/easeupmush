import concurrently from 'concurrently'

const { result } = concurrently(
  [
    { name: 'api', command: 'npm run dev:api', prefixColor: 'yellow' },
    { name: 'web', command: 'npm run dev:web', prefixColor: 'green' },
  ],
  { killOthersOn: ['failure'] },
)
await result
