const express = require('express');
const path = require('path');

const app = express();
const PORT = 5000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use('/images', express.static(path.join(__dirname, 'images')));

app.get('/', (req, res) => {
  res.redirect('/login');
});

app.get('/login', (req, res) => {
  res.render('login');
});

app.get('/in/belmont-redwood-shores-sd46904140100000002/student/portal', (req, res) => {
  res.render('portal');
});

app.get('/illuminatehc', (req, res) => {
  res.render('illuminatehc');
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
