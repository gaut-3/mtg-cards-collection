/**
 * deckBuilder.ts
 *
 * Self-contained Commander deck building logic.
 * No external API calls — works entirely on EnrichedCard[] from the collection.
 *
 * TO REMOVE THIS FEATURE:
 *   1. Delete src/lib/deckBuilder.ts  (this file)
 *   2. Delete src/pages/Builder.tsx
 *   3. Remove the /builder route from App.tsx
 *   4. Remove the Builder nav link from Navbar.tsx
 */

import type { EnrichedCard } from '../types/scryfall'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CardRole {
  ramp: boolean
  draw: boolean
  removal: boolean
  wipe: boolean
  tutor: boolean
  protection: boolean
  wincon: boolean
}

export interface RoleCoverage {
  ramp: EnrichedCard[]
  draw: EnrichedCard[]
  removal: EnrichedCard[]
  wipe: EnrichedCard[]
  tutor: EnrichedCard[]
  protection: EnrichedCard[]
  wincon: EnrichedCard[]
  other: EnrichedCard[]
}

export interface CommanderCandidate {
  card: EnrichedCard
  eligiblePool: EnrichedCard[]   // cards from collection that fit this commander
  coverage: RoleCoverage
  buildabilityScore: number      // 0–100
  stapleCount: number            // cards with edhrecRank < 500
  suggestedDeck: EnrichedCard[]  // top 64 cards from pool (user adds 35 basics)
  gaps: string[]                 // role gaps as human-readable warnings
}

// ---------------------------------------------------------------------------
// Role detection via oracle text + type line
// ---------------------------------------------------------------------------

const RAMP_PATTERNS = [
  /add \{/i,
  /search your library for a? ?(basic )?land/i,
  /put.{0,30}land.{0,20}onto the battlefield/i,
  /untap.{0,20}land/i,
]
const DRAW_PATTERNS = [
  /draw (a|two|three|\d) card/i,
  /draw cards equal/i,
  /look at the top.{0,20}draw/i,
]
const REMOVAL_PATTERNS = [
  /destroy target/i,
  /exile target/i,
  /counter target (spell|ability|activated|triggered)/i,
  /return target.{0,30}to (its owner'?s? hand|hand)/i,
  /deals? \d+ damage to (any target|target creature|target player)/i,
]
const WIPE_PATTERNS = [
  /destroy all/i,
  /exile all/i,
  /each creature gets -\d+\/-\d+/i,
  /all creatures get -\d+\/-\d+/i,
  /return all/i,
]
const TUTOR_PATTERNS = [
  /search your library for (a |an )?card/i,
  /search your library for (a |an )?(instant|sorcery|creature|artifact|enchantment|land|planeswalker)/i,
]
const PROTECTION_PATTERNS = [
  /hexproof/i,
  /indestructible/i,
  /shroud/i,
  /regenerate/i,
  /\+\d\/\+\d.{0,20}until end of turn/i,
  /phasing/i,
]

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(text))
}

export function detectRoles(card: EnrichedCard): CardRole {
  const text = `${card.oracleText} ${card.typeLine}`.toLowerCase()
  const isCreature = card.typeLine.includes('Creature')
  const isLand = card.typeLine.includes('Land')

  return {
    ramp: !isLand && matchesAny(text, RAMP_PATTERNS),
    draw: matchesAny(text, DRAW_PATTERNS),
    removal: matchesAny(text, REMOVAL_PATTERNS),
    wipe: matchesAny(text, WIPE_PATTERNS),
    tutor: matchesAny(text, TUTOR_PATTERNS),
    protection: matchesAny(text, PROTECTION_PATTERNS),
    wincon:
      isCreature &&
      card.edhrecRank !== null &&
      card.edhrecRank < 300 &&
      !card.typeLine.includes('Token'),
  }
}

// ---------------------------------------------------------------------------
// Color identity subset check
// ---------------------------------------------------------------------------

function isSubset(cardIdentity: string[], commanderIdentity: string[]): boolean {
  if (commanderIdentity.length === 0) {
    // Colorless commander — only colorless cards
    return cardIdentity.length === 0
  }
  return cardIdentity.every((c) => commanderIdentity.includes(c))
}

// ---------------------------------------------------------------------------
// Commander detection
// ---------------------------------------------------------------------------

export function findCommanders(collection: EnrichedCard[]): EnrichedCard[] {
  return collection.filter((card) => {
    const isLegendaryCreature =
      card.typeLine.includes('Legendary') &&
      (card.typeLine.includes('Creature') || card.typeLine.includes('Planeswalker'))
    const isLegal = card.legalities['commander'] === 'legal'
    return isLegendaryCreature && isLegal
  })
}

// ---------------------------------------------------------------------------
// Build eligible pool for a given commander
// ---------------------------------------------------------------------------

function buildEligiblePool(
  commander: EnrichedCard,
  collection: EnrichedCard[]
): EnrichedCard[] {
  return collection.filter((card) => {
    if (card.scryfallId === commander.scryfallId) return false
    if (card.legalities['commander'] !== 'legal') return false
    // Basic lands are always allowed — skip identity check for them
    const isBasic =
      card.typeLine.includes('Basic') && card.typeLine.includes('Land')
    if (isBasic) return false // we note basics separately, not included in owned pool
    return isSubset(card.colorIdentity, commander.colorIdentity)
  })
}

// ---------------------------------------------------------------------------
// Sort cards by EDHREC rank (lower = more popular), nulls last
// ---------------------------------------------------------------------------

function byEdhrecRank(a: EnrichedCard, b: EnrichedCard): number {
  const ra = a.edhrecRank ?? 99999
  const rb = b.edhrecRank ?? 99999
  return ra - rb
}

// ---------------------------------------------------------------------------
// Build role coverage map
// ---------------------------------------------------------------------------

function buildCoverage(pool: EnrichedCard[]): RoleCoverage {
  const coverage: RoleCoverage = {
    ramp: [], draw: [], removal: [], wipe: [],
    tutor: [], protection: [], wincon: [], other: [],
  }

  for (const card of pool) {
    const roles = detectRoles(card)
    let assigned = false
    if (roles.ramp)       { coverage.ramp.push(card);       assigned = true }
    if (roles.draw)       { coverage.draw.push(card);       assigned = true }
    if (roles.removal)    { coverage.removal.push(card);    assigned = true }
    if (roles.wipe)       { coverage.wipe.push(card);       assigned = true }
    if (roles.tutor)      { coverage.tutor.push(card);      assigned = true }
    if (roles.protection) { coverage.protection.push(card); assigned = true }
    if (roles.wincon)     { coverage.wincon.push(card);     assigned = true }
    if (!assigned)        { coverage.other.push(card) }
  }

  // Sort each category by EDHREC rank
  for (const key of Object.keys(coverage) as (keyof RoleCoverage)[]) {
    coverage[key].sort(byEdhrecRank)
  }

  return coverage
}

// ---------------------------------------------------------------------------
// Build a suggested 99-card deck (without basic lands)
// Targets per role, then fill with best remaining cards
// ---------------------------------------------------------------------------

const ROLE_TARGETS: Record<keyof Omit<RoleCoverage, 'other'>, number> = {
  ramp: 10,
  draw: 10,
  removal: 8,
  wipe: 3,
  tutor: 4,
  protection: 3,
  wincon: 6,
}

function buildSuggestedDeck(coverage: RoleCoverage): EnrichedCard[] {
  const selected = new Set<string>()
  const deck: EnrichedCard[] = []

  const add = (card: EnrichedCard) => {
    if (!selected.has(card.scryfallId)) {
      selected.add(card.scryfallId)
      deck.push(card)
    }
  }

  // Fill role targets first
  for (const [role, target] of Object.entries(ROLE_TARGETS) as [keyof typeof ROLE_TARGETS, number][]) {
    for (const card of coverage[role].slice(0, target)) {
      add(card)
    }
  }

  // Fill remaining slots with highest-ranked cards from other + overflow
  const allByRank = [
    ...coverage.ramp, ...coverage.draw, ...coverage.removal,
    ...coverage.wipe, ...coverage.tutor, ...coverage.protection,
    ...coverage.wincon, ...coverage.other,
  ].sort(byEdhrecRank)

  for (const card of allByRank) {
    if (deck.length >= 64) break // leave room for ~35 basics
    add(card)
  }

  return deck
}

// ---------------------------------------------------------------------------
// Buildability score 0–100
// ---------------------------------------------------------------------------

function calcBuildabilityScore(
  pool: EnrichedCard[],
  coverage: RoleCoverage,
  suggestedDeck: EnrichedCard[]
): number {
  // Pool size score (up to 30 pts) — 99 cards = full score
  const poolScore = Math.min(30, Math.round((pool.length / 99) * 30))

  // Role coverage score (up to 50 pts)
  const roleScore = Object.entries(ROLE_TARGETS).reduce((sum, [role, target]) => {
    const have = coverage[role as keyof typeof ROLE_TARGETS].length
    return sum + Math.min(1, have / target) * (50 / Object.keys(ROLE_TARGETS).length)
  }, 0)

  // Staple quality score (up to 20 pts)
  const staples = suggestedDeck.filter((c) => c.edhrecRank !== null && c.edhrecRank < 500).length
  const stapleScore = Math.min(20, Math.round((staples / 20) * 20))

  return Math.round(poolScore + roleScore + stapleScore)
}

// ---------------------------------------------------------------------------
// Generate gap warnings
// ---------------------------------------------------------------------------

function buildGaps(coverage: RoleCoverage): string[] {
  const gaps: string[] = []
  const checks: [keyof typeof ROLE_TARGETS, number, string][] = [
    ['ramp', 6, 'ramp'],
    ['draw', 5, 'card draw'],
    ['removal', 4, 'single-target removal'],
    ['wipe', 2, 'board wipes'],
    ['tutor', 1, 'tutors'],
  ]
  for (const [role, min, label] of checks) {
    const count = coverage[role].length
    if (count === 0) gaps.push(`No ${label} pieces found`)
    else if (count < min) gaps.push(`Only ${count} ${label} piece${count === 1 ? '' : 's'} (recommend ${min}+)`)
  }
  return gaps
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function analyzeCollection(collection: EnrichedCard[]): CommanderCandidate[] {
  const commanders = findCommanders(collection)
  const candidates: CommanderCandidate[] = []

  for (const commander of commanders) {
    const eligiblePool = buildEligiblePool(commander, collection)
    if (eligiblePool.length < 10) continue // not enough cards to bother

    const coverage = buildCoverage(eligiblePool)
    const suggestedDeck = buildSuggestedDeck(coverage)
    const buildabilityScore = calcBuildabilityScore(eligiblePool, coverage, suggestedDeck)
    const stapleCount = eligiblePool.filter(
      (c) => c.edhrecRank !== null && c.edhrecRank < 500
    ).length
    const gaps = buildGaps(coverage)

    candidates.push({
      card: commander,
      eligiblePool,
      coverage,
      buildabilityScore,
      stapleCount,
      suggestedDeck,
      gaps,
    })
  }

  // Sort by buildability score descending
  return candidates.sort((a, b) => b.buildabilityScore - a.buildabilityScore)
}

// ---------------------------------------------------------------------------
// Format deck as plain text (for copy/paste into Deck Analyzer)
// ---------------------------------------------------------------------------

export function deckToText(commander: EnrichedCard, deck: EnrichedCard[]): string {
  const lines = [`1 ${commander.name}`, '']
  const byType: Record<string, EnrichedCard[]> = {}
  for (const card of deck) {
    const type = card.typeLine.includes('Creature') ? 'Creatures'
      : card.typeLine.includes('Instant') ? 'Instants'
      : card.typeLine.includes('Sorcery') ? 'Sorceries'
      : card.typeLine.includes('Enchantment') ? 'Enchantments'
      : card.typeLine.includes('Artifact') ? 'Artifacts'
      : card.typeLine.includes('Planeswalker') ? 'Planeswalkers'
      : card.typeLine.includes('Land') ? 'Lands'
      : 'Other'
    if (!byType[type]) byType[type] = []
    byType[type].push(card)
  }
  const order = ['Creatures', 'Instants', 'Sorceries', 'Enchantments', 'Artifacts', 'Planeswalkers', 'Lands', 'Other']
  for (const type of order) {
    if (!byType[type]?.length) continue
    lines.push(`// ${type}`)
    for (const card of byType[type]) {
      lines.push(`1 ${card.name}`)
    }
    lines.push('')
  }
  lines.push('// Add ~35 basic lands to complete the deck')
  return lines.join('\n')
}
