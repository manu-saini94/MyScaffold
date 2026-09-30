/** Lazy world chunk; also called on pointer hover/down so the expand transition never waits on the network. */
export const preloadWorld = () => import('./WorldRoute')
