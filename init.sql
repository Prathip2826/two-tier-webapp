CREATE TABLE IF NOT EXISTS students (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  course VARCHAR(100) NOT NULL,
  email VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO students (name, course, email) VALUES
('Prathip Kumar', 'AI & Data Science', 'prathip@example.com'),
('Sujitha S', 'Computer Science', 'sujitha@example.com');

CREATE TABLE IF NOT EXISTS incidents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  type VARCHAR(30) NOT NULL,
  detail VARCHAR(255) NOT NULL,
  action_taken VARCHAR(50) NOT NULL,
  ai_summary TEXT,
  resolved_at TIMESTAMP NULL,
  latency_ms INT NULL
);
