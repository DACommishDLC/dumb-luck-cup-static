// firebase-config.js
// Firebase configuration and database wrapper for Dumb Luck Cup

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyADVrTJd6_-mKQNsrs4qF_sB5GUPw22Lxo",
  authDomain: "dumb-luck-cup.firebaseapp.com",
  projectId: "dumb-luck-cup",
  storageBucket: "dumb-luck-cup.firebasestorage.app",
  messagingSenderId: "535944160760",
  appId: "1:535944160760:web:8b50a26287066614d6620d",
  databaseURL: "https://dumb-luck-cup-default-rtdb.firebaseio.com"
};

// Check if Firebase SDK is loaded
if (typeof firebase === 'undefined') {
  console.error('Firebase SDK not loaded! Add these scripts to your HTML:');
  console.error('<script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js"></script>');
  console.error('<script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-database-compat.js"></script>');
}

// Initialize Firebase
let app, db;
try {
  app = firebase.initializeApp(firebaseConfig);
  db = firebase.database();
  console.log('✅ Firebase initialized');
} catch (error) {
  console.error('❌ Firebase initialization failed:', error);
}

// Database Wrapper - Replaces all localStorage calls
const DLC_DB = {
  
  // ─── Games ─────────────────────────────────────────────────────────────
  
  async saveGames(games) {
    try {
      await db.ref('games').set(games);
      console.log('✅ Games saved to Firebase');
    } catch (error) {
      console.error('❌ Error saving games:', error);
      throw error;
    }
  },

  async loadGames() {
    try {
      const snapshot = await db.ref('games').once('value');
      const games = snapshot.val() || [];
      console.log('✅ Games loaded from Firebase:', games.length);
      return games;
    } catch (error) {
      console.error('❌ Error loading games:', error);
      return [];
    }
  },

  onGamesChange(callback) {
    db.ref('games').on('value', (snapshot) => {
      const games = snapshot.val() || [];
      callback(games);
    });
  },

  // ─── Player Picks ──────────────────────────────────────────────────────
  
  async savePlayerPicks(playerName, picks) {
    try {
      await db.ref(`picks/${playerName}`).set(picks);
      console.log(`✅ Picks saved for ${playerName}`);
    } catch (error) {
      console.error(`❌ Error saving picks for ${playerName}:`, error);
      throw error;
    }
  },

  async loadPlayerPicks(playerName) {
    try {
      const snapshot = await db.ref(`picks/${playerName}`).once('value');
      const picks = snapshot.val() || {};
      console.log(`✅ Picks loaded for ${playerName}:`, Object.keys(picks).length);
      return picks;
    } catch (error) {
      console.error(`❌ Error loading picks for ${playerName}:`, error);
      return {};
    }
  },

  onPlayerPicksChange(playerName, callback) {
    db.ref(`picks/${playerName}`).on('value', (snapshot) => {
      const picks = snapshot.val() || {};
      callback(picks);
    });
  },

  async loadAllPlayerPicks() {
    try {
      const snapshot = await db.ref('picks').once('value');
      const allPicks = snapshot.val() || {};
      console.log('✅ All player picks loaded:', Object.keys(allPicks).length, 'players');
      return allPicks;
    } catch (error) {
      console.error('❌ Error loading all picks:', error);
      return {};
    }
  },

  onAllPicksChange(callback) {
    db.ref('picks').on('value', (snapshot) => {
      const allPicks = snapshot.val() || {};
      callback(allPicks);
    });
  },

  // ─── Settings / Config ─────────────────────────────────────────────────
  
  async saveConfig(key, value) {
    try {
      await db.ref(`config/${key}`).set(value);
      console.log(`✅ Config saved: ${key}`);
    } catch (error) {
      console.error(`❌ Error saving config ${key}:`, error);
      throw error;
    }
  },

  async loadConfig(key) {
    try {
      const snapshot = await db.ref(`config/${key}`).once('value');
      return snapshot.val();
    } catch (error) {
      console.error(`❌ Error loading config ${key}:`, error);
      return null;
    }
  },

  // ─── Utility ───────────────────────────────────────────────────────────
  
  async clearAllData() {
    if (!confirm('⚠️ This will DELETE ALL DATA. Are you absolutely sure?')) return;
    if (!confirm('Really? This cannot be undone.')) return;
    
    try {
      await db.ref().set(null);
      console.log('✅ All data cleared');
      alert('All data has been cleared from Firebase');
    } catch (error) {
      console.error('❌ Error clearing data:', error);
      alert('Error clearing data: ' + error.message);
    }
  },

  // ─── Migration from localStorage ──────────────────────────────────────
  
  async migrateFromLocalStorage() {
    console.log('🔄 Migrating data from localStorage to Firebase...');
    
    // Migrate games
    const gamesJSON = localStorage.getItem('dlc_games');
    if (gamesJSON) {
      try {
        const games = JSON.parse(gamesJSON);
        await this.saveGames(games);
        console.log('✅ Games migrated');
      } catch (e) {
        console.error('❌ Failed to migrate games:', e);
      }
    }

    // Migrate player picks
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('dlc_picks_')) {
        const playerName = key.replace('dlc_picks_', '');
        try {
          const picks = JSON.parse(localStorage.getItem(key));
          await this.savePlayerPicks(playerName, picks);
          console.log(`✅ Picks migrated for ${playerName}`);
        } catch (e) {
          console.error(`❌ Failed to migrate picks for ${playerName}:`, e);
        }
      }
    }

    console.log('✅ Migration complete!');
    alert('Data migrated from localStorage to Firebase successfully!');
  }
};

// Export for use in other files
if (typeof window !== 'undefined') {
  window.DLC_DB = DLC_DB;
}
