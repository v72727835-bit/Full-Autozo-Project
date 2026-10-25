// The cPanel account's process limit counts threads. Node's default libuv
// pool is 4 threads per process; 2 is plenty for this API. Must be imported
// first, before anything touches the thread pool.
process.env.UV_THREADPOOL_SIZE ??= '2';

export {};
