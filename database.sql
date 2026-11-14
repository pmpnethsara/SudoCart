CREATE DATABASE IF NOT EXISTS sudorank_db;
USE sudorank_db;

CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(120) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('user', 'admin') DEFAULT 'user',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS events (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(150) NOT NULL,
    university VARCHAR(100) NOT NULL,
    category VARCHAR(50) NOT NULL,
    event_date DATE NOT NULL,
    deadline DATE NOT NULL,
    venue VARCHAR(150) NOT NULL,
    link VARCHAR(255),
    description TEXT NOT NULL,
    image_url VARCHAR(255),
    approved BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ads (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company VARCHAR(100) NOT NULL,
    title VARCHAR(150) NOT NULL,
    ad_type VARCHAR(50) NOT NULL,
    link VARCHAR(255),
    description TEXT NOT NULL,
    approved BOOLEAN DEFAULT FALSE,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    category VARCHAR(50) NOT NULL,
    price DECIMAL(10,2) NOT NULL DEFAULT 0,
    seller VARCHAR(120) NOT NULL,
    description TEXT NOT NULL,
    image_url VARCHAR(255),
    order_link VARCHAR(500) NOT NULL,
    approved BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- If you already created the database before the photo feature, run this once instead of re-creating:
-- ALTER TABLE events ADD COLUMN image_url VARCHAR(255) NULL;
-- (The products table above uses CREATE TABLE IF NOT EXISTS, so re-running this file only adds it.)

INSERT INTO events (title, university, category, event_date, deadline, venue, description, approved) VALUES
('CodeFest 2026', 'University of Moratuwa', 'Programming', '2026-11-21', '2026-11-15', 'University of Moratuwa', 'A campus-wide coding challenge for curious builders and problem solvers.', TRUE),
('AI for Tomorrow', 'University of Colombo', 'AI', '2026-11-26', '2026-11-20', 'Online', 'Explore practical machine learning, responsible AI and real-world applications.', TRUE),
('Capture The Flag', 'University of Peradeniya', 'Cybersecurity', '2026-12-04', '2026-11-29', 'Faculty of Engineering', 'Team up, solve security challenges and test your ethical hacking skills.', TRUE);
