// Device ID generation and management
// Generates a unique, memorable device identifier (e.g., "swift-tiger-42")
// using machine hardware ID as a deterministic seed.

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { machineIdSync } = require('node-machine-id')
import Store from 'electron-store'

// Word lists for generating memorable device IDs (adjective-animal-number pattern)
const ADJECTIVES = [
    'swift', 'brave', 'calm', 'dark', 'eager', 'fair', 'glad', 'happy',
    'keen', 'light', 'mild', 'noble', 'plain', 'quick', 'rich', 'safe',
    'tame', 'vast', 'warm', 'young', 'bold', 'cool', 'deep', 'fine',
    'gold', 'high', 'iron', 'jade', 'kind', 'loud', 'mega', 'neat',
    'open', 'pure', 'rare', 'soft', 'true', 'unit', 'vivid', 'wise',
    'zero', 'azure', 'black', 'coral', 'dawn', 'east', 'frost', 'green',
    'haze', 'ivory', 'jet', 'khaki', 'lunar', 'maple', 'north', 'olive',
    'pearl', 'quartz', 'ruby', 'sand', 'teal', 'ultra', 'violet', 'white',
    'xray', 'yellow', 'zinc', 'amber', 'blue', 'cream', 'dusk', 'ember',
    'fawn', 'gray', 'honey', 'indigo', 'jasper', 'kiwi', 'lime', 'mint'
]

const ANIMALS = [
    'tiger', 'eagle', 'wolf', 'bear', 'fox', 'hawk', 'lion', 'deer',
    'owl', 'swan', 'crow', 'duck', 'fish', 'goat', 'hare', 'ibis',
    'jay', 'kite', 'lark', 'mole', 'newt', 'orca', 'puma', 'quail',
    'raven', 'seal', 'toad', 'viper', 'wren', 'yak', 'zebra', 'ant',
    'bat', 'cat', 'dog', 'eel', 'frog', 'gull', 'hen', 'iguana',
    'jackal', 'koala', 'lynx', 'mouse', 'narwhal', 'otter', 'panda', 'robin',
    'shark', 'turtle', 'urchin', 'vulture', 'whale', 'xerus', 'yeti', 'zorro',
    'alpaca', 'bison', 'cobra', 'dragon', 'elk', 'falcon', 'gecko', 'hippo',
    'impala', 'jaguar', 'kiwi', 'lemur', 'moose', 'nautilus', 'osprey', 'python'
]

interface DeviceIdStore {
    deviceId?: string
    deviceName?: string
    createdAt?: number
}

// electron-store instance for device ID persistence
// Using 'any' because electron-store generic typing is incomplete in this project
const store: any = new Store({
    name: 'remote-device',
    defaults: {}
})

/**
 * Get or create a unique device ID.
 * Uses machine hardware ID as seed for deterministic generation.
 * Once generated, the ID is persisted in electron-store.
 */
export function getOrCreateDeviceId(): string {
    const existingId = store.get('deviceId')
    if (existingId) {
        return existingId
    }

    const deviceId = generateDeviceId()
    store.set('deviceId', deviceId)
    store.set('createdAt', Date.now())

    console.log('[DeviceId] Generated new device ID:', deviceId)
    return deviceId
}

/**
 * Generate a device ID from machine hardware ID.
 * Format: adjective-animal-00 (e.g., swift-tiger-42)
 */
function generateDeviceId(): string {
    try {
        // Use first 8 hex chars of machine ID as a numeric seed
        const machineId = machineIdSync()
        const seedHex = machineId.slice(0, 8)
        const seed = parseInt(seedHex, 16)

        const adjIndex = seed % ADJECTIVES.length
        const animalIndex = Math.floor(seed / ADJECTIVES.length) % ANIMALS.length
        const number = (seed % 100).toString().padStart(2, '0')

        return `${ADJECTIVES[adjIndex]}-${ANIMALS[animalIndex]}-${number}`
    } catch (error) {
        console.error('[DeviceId] Failed to get machine ID, using random:', error)
        return generateRandomDeviceId()
    }
}

/**
 * Generate a random device ID (fallback when machine ID is unavailable)
 */
function generateRandomDeviceId(): string {
    const adjIndex = Math.floor(Math.random() * ADJECTIVES.length)
    const animalIndex = Math.floor(Math.random() * ANIMALS.length)
    const number = Math.floor(Math.random() * 100).toString().padStart(2, '0')

    return `${ADJECTIVES[adjIndex]}-${ANIMALS[animalIndex]}-${number}`
}

/**
 * Get device name (user-customizable display name).
 * Falls back to device ID if no custom name has been set.
 */
export function getDeviceName(): string {
    return store.get('deviceName') || getOrCreateDeviceId()
}

/**
 * Set a custom device name
 */
export function setDeviceName(name: string): void {
    store.set('deviceName', name)
}

/**
 * Reset device ID (generates a new random one)
 */
export function resetDeviceId(): string {
    const newId = generateRandomDeviceId()
    store.set('deviceId', newId)
    store.set('createdAt', Date.now())
    console.log('[DeviceId] Reset device ID:', newId)
    return newId
}

/**
 * Get full device info object
 */
export function getDeviceInfo(): { deviceId: string; deviceName: string; createdAt: number } {
    return {
        deviceId: getOrCreateDeviceId(),
        deviceName: getDeviceName(),
        createdAt: store.get('createdAt') || Date.now()
    }
}
