// Import required modules
const express = require('express');
const mysql = require('mysql2/promise'); // Using the promise-based version of mysql2
const cors = require('cors');

// --- CONFIGURATION ---
const app = express();
const PORT = 3000;

// MySQL Database Connection Configuration
const dbConfig = {
    host: 'localhost',      // Replace with your MySQL host if different
    user: 'root',           // Replace with your MySQL username
    password: 'password',   // Replace with your MySQL password
    database: 'blood_donor_db' // The name of your database
};

// --- MIDDLEWARE ---
app.use(cors()); // Enable Cross-Origin Resource Sharing for all routes
app.use(express.json()); // Enable the express server to parse JSON formatted request bodies

// --- DATABASE INITIALIZATION ---
let db;

/**
 * Initializes the database connection and creates the necessary table if it doesn't exist.
 */
async function initializeDatabase() {
    try {
        // Create a connection pool
        db = await mysql.createPool(dbConfig);

        // SQL statement to create the 'donors' table
        const createTableQuery = `
        CREATE TABLE IF NOT EXISTS donors (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            age INT NOT NULL,
            bloodGroup VARCHAR(3) NOT NULL,
            phone VARCHAR(20) NOT NULL UNIQUE,
            email VARCHAR(255) NOT NULL,
            address TEXT NOT NULL,
            latitude DECIMAL(10, 8) NOT NULL,
            longitude DECIMAL(11, 8) NOT NULL,
            registration_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );`;

        // Execute the query
        await db.query(createTableQuery);
        console.log("Database connected and 'donors' table is ready.");
    } catch (error) {
        console.error("FATAL: Could not connect to the database.", error);
        process.exit(1); // Exit the process with an error code
    }
}


// --- API ROUTES ---

/**
 * @route   POST /api/donors
 * @desc    Register a new blood donor
 */
app.post('/api/donors', async (req, res) => {
    const { name, age, bloodGroup, phone, email, address, latitude, longitude } = req.body;

    // Basic validation
    if (!name || !age || !bloodGroup || !phone || !latitude || !longitude) {
        return res.status(400).json({ message: 'Please provide all required fields.' });
    }

    const insertQuery = 'INSERT INTO donors (name, age, bloodGroup, phone, email, address, latitude, longitude) VALUES (?, ?, ?, ?, ?, ?, ?, ?)';
    
    try {
        const [result] = await db.query(insertQuery, [name, age, bloodGroup, phone, email, address, latitude, longitude]);
        res.status(201).json({ message: 'Donor registered successfully!', donorId: result.insertId });
    } catch (error) {
        // Handle potential duplicate phone number error
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'A donor with this phone number is already registered.' });
        }
        console.error("Error registering donor:", error);
        res.status(500).json({ message: 'Internal server error.' });
    }
});

/**
 * @route   GET /api/donors/search
 * @desc    Search for nearby donors using the Haversine formula
 */
app.get('/api/donors/search', async (req, res) => {
    const { latitude, longitude, bloodGroup } = req.query;
    const searchRadiusKm = 15; // 15 km radius

    // Basic validation
    if (!latitude || !longitude || !bloodGroup) {
        return res.status(400).json({ message: 'Latitude, longitude, and blood group are required.' });
    }

    // Haversine formula in SQL to calculate distance in kilometers.
    // This is the core of the geospatial search.
    // 6371 is the Earth's radius in kilometers.
    const searchQuery = `
        SELECT 
            id, name, bloodGroup, phone, latitude, longitude,
            ( 6371 * acos( cos( radians(?) ) * cos( radians( latitude ) ) * cos( radians( longitude ) - radians(?) ) + sin( radians(?) ) * sin( radians( latitude ) ) ) ) AS distance 
        FROM donors
        WHERE bloodGroup = ?
        HAVING distance < ?
        ORDER BY distance;
    `;

    try {
        const [donors] = await db.query(searchQuery, [latitude, longitude, latitude, bloodGroup, searchRadiusKm]);
        res.status(200).json(donors);
    } catch (error) {
        console.error("Error searching for donors:", error);
        res.status(500).json({ message: 'Internal server error.' });
    }
});


// --- START SERVER ---
app.listen(PORT, async () => {
    await initializeDatabase();
    console.log(`Server is running on http://localhost:${PORT}`);
});
