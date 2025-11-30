-- Check for users without hubs
SELECT u.id, u.first_name, u.last_name
FROM users u
WHERE NOT EXISTS (
  SELECT 1 FROM hub_members hm WHERE hm.user_id = u.id
)
LIMIT 5;
