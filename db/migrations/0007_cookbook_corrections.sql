-- Admin corrections, photo credits and image review on staged cookbook recipes are audited like other content actions.
ALTER TABLE content_audit DROP CONSTRAINT content_audit_action_check;
ALTER TABLE content_audit ADD CONSTRAINT content_audit_action_check CHECK (action IN (
 'cookbook_text_reviewed','cookbook_published','translation_saved','translation_approved',
 'cookbook_corrected','photo_credit_recorded','cookbook_images_reviewed'));
ALTER TABLE photo_credits
 ADD COLUMN recorded_by uuid REFERENCES members(id),
 ADD COLUMN recorded_at timestamptz NOT NULL DEFAULT now();
