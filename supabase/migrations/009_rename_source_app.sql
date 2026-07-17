-- Rename source_app values: trans_master → lingua_gym, spanish_coach → lingua_coach
UPDATE vocabulary SET source_app = 'lingua_gym'   WHERE source_app = 'trans_master';
UPDATE vocabulary SET source_app = 'lingua_coach' WHERE source_app = 'spanish_coach';
