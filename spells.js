// THE SPELL BOOK - recreated from the Wizards (Steam) spell list in its local data files (names, schools, aim types,
// numbers; the live game may have tuned them since). Every spell is plain data: change a number or a line and reload.
//
// aim:   "charge"  aim with the arrow keys / mouse and hold to charge power (ANGLE_CHARGE)
//        "angle"   aim only, fixed speed (ANGLE)
//        "target"  click a spot on the map (TARGET)
//        "aerial"  click a spot; it falls from the sky (TARGET_AERIAL)
//        "self"    cast instantly on yourself (SIMPLE)
// fx:    what happens - see game.js FX for the full list (explode, cluster, spray, napalm, bounce, teleport, heal,
//        shield, freeze, terrain, dig, bolt, ray, rocketjump, haste, burn, bomb, quake, piety)
// joke:  shown on screen when the spell is cast. Leave "" for the game's own description.
// The in-game SPELL FORGE (button on the start screen) can rename any spell and set its joke line without editing this
// file; those edits are saved in the browser.
const SCHOOLS = { FIRE: "#ff7a1a", ARCANE: "#c06bff", ROCK: "#c9a26b", ICE: "#8fe3ff", WATER: "#3d9bff", STORM: "#ffe14a", UNDERDARK: "#8a5cff", NATURE: "#6fe36a", OVERLIGHT: "#fff3b0", PARTY: "#ff4fa8" };

const SPELLS = [
  // ---------------- FIRE ----------------
  { id: 0, school: "FIRE", name: "Fireball", aim: "charge", fx: "explode", radius: 34, damage: 40, napalm: 8, desc: "Explodes into napalm and deals 40 damage to anything hit." },
  { id: 1, school: "FIRE", name: "Firebomb", aim: "charge", fx: "cluster", radius: 24, damage: 15, bomblets: 5, bombletDamage: 25, fuse: 4, desc: "After 4 seconds explodes into 5 fireballs that deal 25 damage each." },
  { id: 2, school: "FIRE", name: "Napalm", aim: "angle", fx: "spray", count: 12, spread: 0.35, speed: 11, radius: 6, damage: 5, sticky: "napalm", desc: "Shoot 12 napalm towards the target. 5 damage per napalm." },
  { id: 3, school: "FIRE", name: "Rain of Fire", aim: "aerial", fx: "rain", count: 15, radius: 14, damage: 10, desc: "Drop rows of fireballs on a target location. 10 damage each." },
  { id: 4, school: "FIRE", name: "Napalm Bomb", aim: "charge", fx: "explode", radius: 20, damage: 10, napalm: 20, desc: "A bomb that bursts into 20 napalm." },
  { id: 5, school: "FIRE", name: "Meteor", aim: "aerial", fx: "meteor", radius: 46, damage: 55, pierce: 3, desc: "A meteor that pierces terrain and scatters rocks." },
  { id: 8, school: "FIRE", name: "Fire Arrow", aim: "charge", fx: "arrow", radius: 20, damage: 60, desc: "A fast arrow that hits harder the longer it flies (up to 60)." },
  { id: 10, school: "FIRE", name: "Living Bomb", aim: "target", fx: "bomb", turns: 3, radius: 50, damage: 50, desc: "Plant a bomb that explodes after 3 turns for 50 damage." },
  { id: 12, school: "FIRE", name: "Self-Immolation", aim: "self", fx: "burn", turns: 4, damage: 5, desc: "Burn yourself 5 per turn for 4 turns; your fire spells deal +50%." },
  { id: 13, school: "FIRE", name: "Rocket Jump", aim: "charge", fx: "rocketjump", radius: 22, damage: 10, desc: "Aim at your feet to launch into the air. Doesn't use your turn." },
  { id: 14, school: "FIRE", name: "Firework", aim: "angle", fx: "peakburst", count: 8, radius: 16, damage: 12, napalm: 6, desc: "Bursts into fire and napalm at the top of its arc." },
  { id: 18, school: "FIRE", name: "Lava Bomb", aim: "charge", fx: "multiboom", times: 4, radius: 26, damage: 25, desc: "Explodes 4 times in a row, 25 damage each." },
  // ---------------- ARCANE ----------------
  { id: 20, school: "ARCANE", name: "Arcane Gate", aim: "target", fx: "teleport", desc: "Teleport to a target location." },
  { id: 25, school: "ARCANE", name: "Arcane Blast", aim: "angle", fx: "blast", length: 160, radius: 26, damage: 15, knockback: 12, desc: "A blast that carves terrain and knocks enemies far away." },
  { id: 26, school: "ARCANE", name: "Arcane Arrows", aim: "charge", fx: "volley", count: 4, radius: 14, damage: 10, desc: "Shoot 4 arrows, 10 damage each." },
  { id: 30, school: "ARCANE", name: "Arcane Bomb", aim: "charge", fx: "cluster", radius: 26, damage: 20, bomblets: 3, bombletDamage: 12, fuse: 0, desc: "Explodes into a flash of arcane and 3 missiles." },
  { id: 32, school: "ARCANE", name: "Arcane Orbital", aim: "charge", fx: "bounce", bounces: 6, radius: 18, damage: 15, desc: "Arcane orbs that bounce around, 15 damage per hit." },
  { id: 307, school: "OVERLIGHT", name: "Protection Shield", aim: "self", fx: "shield", stacks: 1, desc: "Blocks the next hit you take (stacks up to 5)." },
  // ---------------- ROCK ----------------
  { id: 40, school: "ROCK", name: "Scatter Rock", aim: "charge", fx: "cluster", radius: 26, damage: 40, bomblets: 5, bombletDamage: 6, fuse: 0, desc: "A rock that deals 40 and explodes into pebbles." },
  { id: 41, school: "ROCK", name: "Quake", aim: "self", fx: "quake", damage: 8, knockback: 7, desc: "An earthquake that knocks everyone around." },
  { id: 50, school: "ROCK", name: "Mud Ball", aim: "charge", fx: "terrain", radius: 38, damage: 20, desc: "Places a lump of terrain where it lands. 20 damage." },
  { id: 51, school: "ROCK", name: "Pebble Destruction", aim: "angle", fx: "spray", count: 10, spread: 0.18, speed: 15, radius: 12, damage: 5, desc: "10 pebbles that tunnel through terrain." },
  { id: 54, school: "ROCK", name: "Mega Boulder", aim: "charge", fx: "boulder", bounces: 4, radius: 24, damage: 20, desc: "A boulder that grows each time it hits the ground." },
  { id: 56, school: "ROCK", name: "Stone Fortress", aim: "self", fx: "fortress", desc: "Raise stone walls around yourself." },
  { id: 59, school: "ROCK", name: "Rock Slab", aim: "target", fx: "slab", desc: "Place a slab of rock anywhere. How neat is that!" },
  // ---------------- ICE ----------------
  { id: 60, school: "ICE", name: "Snowball", aim: "charge", fx: "grow", radius: 22, damage: 60, desc: "A snowball that grows while it flies, then shatters." },
  { id: 61, school: "ICE", name: "Ice Bomb", aim: "charge", fx: "freezebomb", radius: 30, damage: 15, freeze: 2, desc: "Bursts into ice shards and freezes everyone nearby for 2 turns." },
  { id: 68, school: "ICE", name: "Ice Shards", aim: "angle", fx: "spray", count: 20, spread: 0.3, speed: 14, radius: 5, damage: 2, freeze: 1, desc: "20 shards, 2 damage each, and they freeze." },
  { id: 73, school: "ICE", name: "Comet", aim: "aerial", fx: "meteor", radius: 52, damage: 90, pierce: 1, desc: "A comet from the sky. At least 90 damage on impact." },
  { id: 75, school: "ICE", name: "Ice Ring", aim: "self", fx: "icering", desc: "A ring of solid ice around you." },
  // ---------------- WATER ----------------
  { id: 80, school: "WATER", name: "Water Ball", aim: "charge", fx: "splash", count: 20, radius: 8, damage: 3, desc: "Bursts into 20 droplets, 3 damage each." },
  { id: 87, school: "WATER", name: "Expunge", aim: "self", fx: "heal", amount: 15, cleanse: true, desc: "Remove debuffs and heal 15 HP." },
  { id: 89, school: "WATER", name: "Clam", aim: "charge", fx: "clam", radius: 36, damage: 70, desc: "Bounces once, digs straight down, then explodes for up to 70." },
  { id: 90, school: "WATER", name: "Rain of Clams", aim: "aerial", fx: "rain", count: 5, radius: 28, damage: 35, desc: "Drop 5 clams on a target location." },
  { id: 93, school: "WATER", name: "Water Jet", aim: "angle", fx: "spray", count: 40, spread: 0.06, speed: 16, radius: 3, damage: 1, knockback: 3, desc: "40 droplets with big knockback, 1 damage each." },
  // ---------------- STORM ----------------
  { id: 100, school: "STORM", name: "Lightning Bolt", aim: "angle", fx: "bolt", count: 10, radius: 10, damage: 5, desc: "10 bolts of lightning, 5 damage each." },
  { id: 107, school: "STORM", name: "Call Lightning", aim: "target", fx: "strike", radius: 22, damage: 30, desc: "A bolt from the heavens at a target location. 30 damage." },
  { id: 109, school: "STORM", name: "Speed of Hermes", aim: "self", fx: "haste", casts: 2, desc: "Cast two more spells this turn." },
  { id: 111, school: "STORM", name: "Shock Bomb", aim: "charge", fx: "explode", radius: 60, damage: 65, keepTerrain: true, desc: "Huge 65-damage shock. Doesn't destroy terrain." },
  { id: 112, school: "STORM", name: "Blink", aim: "angle", fx: "blink", distance: 90, desc: "Teleport a short fixed distance where you aim." },
  { id: 113, school: "STORM", name: "Chain Lightning", aim: "angle", fx: "bounce", bounces: 14, radius: 10, damage: 5, desc: "A ball of lightning that bounces 14 times, 5 damage per hit." },
  // ---------------- UNDERDARK ----------------
  { id: 120, school: "UNDERDARK", name: "Drain Shot", aim: "charge", fx: "drain", radius: 22, damage: 25, desc: "25 damage, and you heal what it drains." },
  { id: 132, school: "UNDERDARK", name: "Necro Shot", aim: "charge", fx: "explode", radius: 24, damage: 30, desc: "30 damage necrotic bolt." },
  // ---------------- NATURE ----------------
  { id: 200, school: "NATURE", name: "Acorn Bomb", aim: "charge", fx: "seeds", radius: 18, damage: 10, count: 5, desc: "An acorn that explodes and scatters seeds that blow up." },
  { id: 204, school: "NATURE", name: "Vine Whip", aim: "angle", fx: "vine", length: 260, radius: 34, damage: 50, desc: "A vine through the ground that explodes where it comes out (50)." },
  { id: 217, school: "NATURE", name: "Vine Bridge", aim: "angle", fx: "bridge", length: 320, desc: "A long bridge of terrain in the aimed direction." },
  // ---------------- OVERLIGHT ----------------
  { id: 300, school: "OVERLIGHT", name: "Healing Ball", aim: "charge", fx: "healball", radius: 26, amount: 35, desc: "Heals 35 HP to anything it hits (aim at your feet for yourself)." },
  { id: 303, school: "OVERLIGHT", name: "Sky Ray", aim: "target", fx: "ray", radius: 20, damage: 50, desc: "A ray of light from the sky at the target. 50 damage." },
  { id: 308, school: "OVERLIGHT", name: "Piety", aim: "self", fx: "piety", desc: "Equalize everyone's HP." },
  { id: 310, school: "OVERLIGHT", name: "Shining Bolt", aim: "angle", fx: "explode", speed: 18, gravity: 0, radius: 18, damage: 30, desc: "A straight shining bolt, 30 damage." },
  // ---------------- PARTY (inside jokes - rename these in the Spell Forge) ----------------
  { id: 900, school: "PARTY", name: "Last Night of Freedom", aim: "charge", fx: "cluster", radius: 40, damage: 35, bomblets: 8, bombletDamage: 10, fuse: 0, joke: "Goes off in every direction at once.", desc: "A huge burst of party." },
  { id: 901, school: "PARTY", name: "Ball and Chain", aim: "target", fx: "freezeone", freeze: 2, joke: "Somebody isn't going anywhere for a while.", desc: "Locks the wizard nearest the target for 2 turns." },
  { id: 902, school: "PARTY", name: "Round on Me", aim: "self", fx: "healall", amount: 20, joke: "Drinks for everyone (+20 HP to all).", desc: "Heals every wizard 20." },
  { id: 903, school: "PARTY", name: "Hangover", aim: "self", fx: "skip", joke: "The next wizard sits this one out.", desc: "The next player loses their turn." },
];
