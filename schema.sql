-- sqlite
drop table if exists pharmacy_drug_availability;
drop table if exists drug;
drop table if exists pharmacy;

create table if not exists pharmacy (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    address TEXT NOT NULL,
    phone TEXT NOT NULL
);

create table if not exists drug (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL
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
