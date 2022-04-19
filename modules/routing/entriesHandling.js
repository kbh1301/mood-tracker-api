// handle calls relating to entry data
module.exports = (app, crypto, dbQuery) => {
    
    // queries database and returns response based on month/year url parameters
    app.get('/data/:month/:year', (req, res) => {
        const { decodedId } = req.body;
        const { month, year } = req.params;
        const query = `
            SELECT * FROM entries
            WHERE user_id=${decodedId}
            AND ${month} IN (EXTRACT(MONTH FROM time_am::date), EXTRACT(MONTH FROM time_pm::date))
            AND ${year} IN (EXTRACT(YEAR FROM time_am::date), EXTRACT(YEAR FROM time_pm::date))
            ORDER BY COALESCE(time_am, time_pm);
        `;

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

    // query configuration used for updates to a row
    const updateQuery = ({ _meridiem, time, mood, anxiety, notes, decodedId }) => {
        return {
            text: `UPDATE entries SET time${_meridiem}='${time}', mood${_meridiem}=$2, anxiety${_meridiem}=$3, notes${_meridiem}=$4 WHERE $1::date IN (time_am::date, time_pm::date) AND user_id=$5`,
            values: [time, mood, anxiety, notes, decodedId]
        }
    };

    // inserts database entry or updates an existing entry
    app.post('/data', (req, res) => {
        req.body = encryptedBody(req.body);
        const { _meridiem, time, mood, anxiety, notes, decodedId } = req.body;
        const _meridiemFlip = _meridiem == '_am' ? '_pm' : '_am';
        const date = time.split('T')[0];

        // query used to check if date of submitted datetime exists in db
        const timeExists = (time) => `SELECT EXISTS(SELECT time${time} FROM entries WHERE time${time}::date=$1 AND user_id=$2)`

        // insert and update queries
        const insert = `INSERT INTO entries(time${_meridiem}, mood${_meridiem}, anxiety${_meridiem}, notes${_meridiem}, user_id) VALUES($1,$2,$3,$4,$5)`;
        const update = updateQuery(req.body);

        // vars for frontend error message
        const timeString = _meridiem == '_am' ? 'DAY' : 'NIGHT';
        const errorString = `A ${timeString} entry for ${date} already exists.`;

        // query if date of submitted datetime exists in db
        dbQuery(timeExists(_meridiem), [time, decodedId], (err, result) => {
            if(err) return console.trace(err);
            // if date of submitted datetime exists, return error
            if(result.rows[0].exists) {
                console.trace(errorString);
                res.statusMessage = errorString;
                res.status(500).end();
            } else {
                // query if the date of opposite datetime exists
                dbQuery(timeExists(_meridiemFlip), [time, decodedId], (err, result) => {
                    if(err) return console.trace(err);
                    // if date of opposite datetime exists, update
                    if(result.rows[0].exists) {
                        res.status(200).end();
                        dbQuery(update, (err) => console.trace(err));
                    }
                    // else insert new row
                    else {
                        res.status(200).end();
                        dbQuery(insert, [time, mood, anxiety, notes, decodedId], (err) => {if(err) return console.trace(err)});
                    }
                })
            }
        })
    });

    // overwrites existing data entry
    app.post('/data/overwrite', (req, res) => {
        req.body = encryptedBody(req.body)
        const update = updateQuery(req.body);

        dbQuery(update, (err) => {if(err) return console.trace(err)});
    });
}