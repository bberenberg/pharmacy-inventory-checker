-- sqlite
drop table if exists pharmacy_drug_availability;
drop table if exists drug;
drop table if exists pharmacy;

create table if not exists pharmacy (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    address TEXT NOT NULL,
    phone TEXT NOT NULL,
    UNIQUE(name, address)
);

create table if not exists drug (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    dose TEXT NOT NULL,
    UNIQUE(name, dose)
);

create table if not exists pharmacy_drug_availability (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    drug_id INTEGER NOT NULL,
    pharmacy_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    available_from DATE NOT NULL,
    alternative_feedback TEXT,
    FOREIGN KEY (drug_id) REFERENCES drug(id),
    FOREIGN KEY (pharmacy_id) REFERENCES pharmacy(id)
    -- skipping unique constraint from now
);

create table if not exists call_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    call_sid TEXT NOT NULL UNIQUE,
    pharmacy_id INTEGER NOT NULL,
    drug_id INTEGER NOT NULL,
    call_status TEXT NOT NULL,
    stock_status BOOLEAN,
    restock_date DATE,
    alternative_feedback TEXT,
    transcript_summary TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (pharmacy_id) REFERENCES pharmacy(id),
    FOREIGN KEY (drug_id) REFERENCES drug(id)
);
