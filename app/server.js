const express = require('express');
const mysql = require('mysql2');
const path = require('path');
const { isValidEmail } = require('./utils');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'password',
  database: process.env.DB_NAME || 'studentdb',
  port: process.env.DB_PORT || 3306
};

let db;

function connectWithRetry() {
  db = mysql.createConnection(dbConfig);
  db.connect((err) => {
    if (err) {
      console.log('DB connection failed, retrying in 5s... ->', err.message);
      setTimeout(connectWithRetry, 5000);
    } else {
      console.log('Connected to MySQL (db tier)');
    }
  });
  db.on('error', (err) => {
    console.log('DB error:', err.code, '- reconnecting...');
    connectWithRetry();
  });
}

connectWithRetry();

// Read all students
app.get('/', (req, res) => {
  db.query('SELECT * FROM students ORDER BY id DESC', (err, results) => {
    if (err) return res.status(500).send('Database error: ' + err.message);
    res.render('index', { students: results, error: null });
  });
});

// Add a student
app.post('/add', (req, res) => {
  const { name, course, email } = req.body;

  if (!name || !course || !email) {
    return renderWithError(res, 'All fields are required.');
  }
  if (!isValidEmail(email)) {
    return renderWithError(res, 'Please enter a valid email address.');
  }

  db.query(
    'INSERT INTO students (name, course, email) VALUES (?, ?, ?)',
    [name, course, email],
    (err) => {
      if (err) return res.status(500).send('Database error: ' + err.message);
      res.redirect('/');
    }
  );
});

// Delete a student
app.post('/delete/:id', (req, res) => {
  db.query('DELETE FROM students WHERE id = ?', [req.params.id], (err) => {
    if (err) return res.status(500).send('Database error: ' + err.message);
    res.redirect('/');
  });
});

// Health check endpoint (used by Docker / Jenkins smoke test)
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', tier: 'app' });
});

function renderWithError(res, message) {
  db.query('SELECT * FROM students ORDER BY id DESC', (err, results) => {
    if (err) return res.status(500).send('Database error: ' + err.message);
    res.status(400).render('index', { students: results, error: message });
  });
}

app.listen(PORT, () => {
  console.log(`App tier running on port ${PORT}`);
});
