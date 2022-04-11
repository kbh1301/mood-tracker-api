// handle calls relating to entry data
module.exports = (app, crypto, dbQuery) => {
    
    // queries database and returns response based on url parameters
    app.get('/data/:month/:year', (req, res) => {
        const { decodedId } = req.body;
        const { month, year } = req.params;
        const query = `SELECT * FROM entries WHERE EXTRACT(MONTH FROM date)=${month} AND EXTRACT(YEAR FROM date)=${year} AND user_id=${decodedId} ORDER BY date`;

        dbQuery(query, (err, result) => {
            if(err) {
                console.trace(err);
                return res.status(400).json('Error getting data');
            }
            // decrypt notes for response
            result.rows.forEach(row => {
                if(row.notes_am) row.notes_am = crypto.decrypt(row.notes_am);
                if(row.notes_pm) row.notes_pm = crypto.decrypt(row.notes_pm);
            });

            return res.json(result.rows);
        });
    });

    // encrypts notes in body and returns modified body
    const encryptedBody = (body) => {
        body.notes = crypto.encrypt(body.notes);
        return body;
    };

    // query used to update an existing entry
    const updateQuery = ({ am_pm, date, time, mood, anxiety, notes, decodedId }) => {
        return {
            text: `UPDATE entries SET time${am_pm}=$2, mood${am_pm}=$3, anxiety${am_pm}=$4, notes${am_pm}=$5 WHERE date=$1 AND user_id=$6`,
            values: [date, time, mood, anxiety, notes, decodedId]
        }
    };

    // inserts database entry or updates an existing entry
    app.post('/data', (req, res) => {
        req.body = encryptedBody(req.body);
        const { am_pm, date, time, mood, anxiety, notes, decodedId } = req.body;

        const dateQuery = 'SELECT EXISTS(SELECT date FROM entries WHERE date=$1 AND user_id=$2)';
        const timeQuery = `SELECT time${am_pm} FROM entries WHERE date=$1 AND time${am_pm} IS NOT NULL AND user_id=$2`;
        const insert = `INSERT INTO entries(id, date, time${am_pm}, mood${am_pm}, anxiety${am_pm}, notes${am_pm}, user_id) VALUES(DEFAULT,$1,$2,$3,$4,$5,$6)`;
        const update = updateQuery(req.body);

        const timeString = am_pm == '_am' ? 'DAY' : 'NIGHT';
        const errorString = `A ${timeString} entry for ${date} already exists.`;

        dbQuery(dateQuery, [date, decodedId], (err, result) => {
            if(err) return console.trace(err);
            // if date exists, query if time is null
            if(result.rows[0].exists) {
                dbQuery(timeQuery, [date, decodedId], (err, result) => {
                    if(err) return console.trace(err);
                    // if time is not null, return error string to frontend and 500 status to prompt overwrite confirmation
                    if(result.rows[0]) {
                        console.trace(errorString);
                        res.statusMessage = errorString;
                        res.status(500).end();
                    }
                    // if time is null, update entry
                    else {
                        res.status(200).end();
                        dbQuery(update, (err) => console.trace(err));
                    };
                });
            }
            // if date does not exist, insert new entry
            else {
                res.status(200).end();
                dbQuery(insert, [date, time, mood, anxiety, notes, decodedId], (err) => console.trace(err));
            };
        });
    });

    // overwrites existing data entry
    app.post('/data/overwrite', (req, res) => {
        req.body = encryptedBody(req.body)
        const update = updateQuery(req.body);

        dbQuery(update, (err) => console.trace(err));
    });
}