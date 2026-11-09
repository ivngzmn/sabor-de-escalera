-- Recipes adapted from a website stay blocked until an admin records how reuse was cleared. Book inclusion is not permission.
ALTER TABLE cookbook_entries
 ADD COLUMN source_clearance text,
 ADD COLUMN source_cleared_by uuid REFERENCES members(id),
 ADD COLUMN source_cleared_at timestamptz;
ALTER TABLE content_audit DROP CONSTRAINT content_audit_action_check;
ALTER TABLE content_audit ADD CONSTRAINT content_audit_action_check CHECK (action IN (
 'cookbook_text_reviewed','cookbook_published','translation_saved','translation_approved',
 'cookbook_corrected','photo_credit_recorded','cookbook_images_reviewed','cookbook_source_cleared'));
