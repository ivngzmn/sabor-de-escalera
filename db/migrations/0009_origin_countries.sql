-- Every Latin American country (plus Puerto Rico) as a recipe origin, each with its ISO code so the app can show its flag.
ALTER TABLE recipe_origins ADD COLUMN country_code text CHECK (country_code ~ '^[A-Z]{2}$');
INSERT INTO recipe_origins(id,label_en,label_es,country_code) VALUES
 ('argentina','Argentina','Argentina','AR'),
 ('bolivia','Bolivia','Bolivia','BO'),
 ('brazil','Brazil','Brasil','BR'),
 ('chile','Chile','Chile','CL'),
 ('colombia','Colombia','Colombia','CO'),
 ('costa-rica','Costa Rica','Costa Rica','CR'),
 ('cuba','Cuba','Cuba','CU'),
 ('dominican-republic','Dominican Republic','República Dominicana','DO'),
 ('ecuador','Ecuador','Ecuador','EC'),
 ('el-salvador','El Salvador','El Salvador','SV'),
 ('guatemala','Guatemala','Guatemala','GT'),
 ('haiti','Haiti','Haití','HT'),
 ('honduras','Honduras','Honduras','HN'),
 ('mexico','Mexico','México','MX'),
 ('nicaragua','Nicaragua','Nicaragua','NI'),
 ('panama','Panama','Panamá','PA'),
 ('paraguay','Paraguay','Paraguay','PY'),
 ('peru','Peru','Perú','PE'),
 ('puerto-rico','Puerto Rico','Puerto Rico','PR'),
 ('uruguay','Uruguay','Uruguay','UY'),
 ('venezuela','Venezuela','Venezuela','VE')
ON CONFLICT (id) DO UPDATE SET country_code=EXCLUDED.country_code;
