export default function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { username, password } = req.body;

  const validUser = process.env.ADMIN_USERNAME;
  const validPass = process.env.ADMIN_PASSWORD;

  if (!validUser || !validPass) {
    return res.status(500).json({ error: 'Server misconfiguration: env vars not set.' });
  }

  if (username === validUser && password === validPass) {
    return res.status(200).json({ success: true });
  }

  return res.status(401).json({ error: 'Incorrect username or password. Please try again.' });
}
