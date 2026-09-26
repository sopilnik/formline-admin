-- The instant the generated template rows are relative to. create_sandbox (0009)
-- shifts them by now() - template_epoch, so a fresh sandbox is always current.
alter table fa.workspaces add column template_epoch timestamptz;
alter table fa.workspaces add constraint workspaces_template_epoch check (kind = 'template' or template_epoch is null);
