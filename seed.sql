DELETE FROM pharmacy;
DELETE FROM drug;

INSERT INTO pharmacy (name, address, phone)
    VALUES ('CVS (Mulberry Street)', '298 Mulberry St, New York, NY 10012', '+12122266111');

INSERT INTO drug (name)
    VALUES ('Amoxicillin'), ('Docusate');