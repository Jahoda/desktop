/**
 * Gait builds must not use GitHub Desktop's update feed: it serves official
 * GitHub Desktop builds, which fail to install over Gait (different bundle ID)
 * and would replace Gait if they ever succeeded. Gait is updated by building
 * from source instead.
 */
export const enableAutoUpdates = false
