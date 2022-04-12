// handle calls relating to users
module.exports = (app, validateUser, crypto, dbQuery) => {

    // if user is Demo during login, check if new demo data is necessary and generate it if so
    const generateDemoData = (id, topDate, bottomDate, res) => {

        // run db query to check if data is already current for last 90 days
        const topDateQuery = `SELECT EXISTS(SELECT 1 FROM entries WHERE user_id=${id} AND date='${topDate}')`;
        dbQuery(topDateQuery, (err, result) => {
            let topDateExists = false;
            if(err) {
                console.trace(err);
                return res.status(400).json('Error validating Demo user data');
            };
            topDateExists = result.rows[0].exists;

            // if demo data is not current, delete demo data and create data for last 90 days
            if(!topDateExists) {
                // run db query to delete all current entries for demo user
                const deletionQuery = `DELETE FROM entries WHERE user_id=${id}`;
                dbQuery(deletionQuery, (err) => {
                    if(err) {
                        console.trace(err);
                        return res.status(400).json('Error deleting data');
                    };
                });

                // random # between 1-7
                const ranNum = '6*random()+1';
                // notes
                let notes = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.';
                // encrypt notes
                notes = crypto.encrypt(notes);

                // run db query to generate dummy data for last 90 days
                const generate_series = `SELECT datetime::date, datetime::time with time zone, ${ranNum}, ${ranNum}, '${notes}', datetime::time with time zone + interval '12 hours', ${ranNum}, ${ranNum}, '${notes}', '${id}'
                    FROM generate_series('${bottomDate}'::timestamp with time zone, '${topDate}'::timestamp with time zone, '1 day'::interval) as datetime`;
                // inserts random data into entries table
                const generationQuery = `INSERT INTO entries(date, time_am, mood_am, anxiety_am, notes_am, time_pm, mood_pm, anxiety_pm, notes_pm, user_id) ${generate_series}`;

                // generates random data and inserts to entries table
                dbQuery(generationQuery, (err) => {
                    if(err) return res.status(400).json('Error generating data');
                });
            };
        });
    };
    
    // add new user (not available in frontend; use Postman)
    app.post('/users', async (req, res) => {
        const { username, password } = req.body;
        const hashedPassword = await crypto.hash(password);
        const insert = {
            text: `INSERT INTO users(user_id, username, password) VALUES(DEFAULT,$1,$2)`,
            values: [username, hashedPassword]
        };

        dbQuery(insert, null, (err) => {
            if(err) {
                console.trace(err);
                return res.status(500).end();
            };
            return res.status(201).end();
        });
    });

    // route for attempted login; runs user validation middleware
    app.post('/users/login', validateUser, (req, res) => {
        const { token, refreshToken, username } = req.body;

        // if user is 'Demo', ensure database has entries for the last 90 days
        if(username == 'Demo') {
            const { id, topDate, bottomDate } = req.body;
            generateDemoData(id, topDate, bottomDate, res);
        };

        // if user is valid, send new tokens to frontend
        const response = {token: token, refreshToken: refreshToken};
        return res.status(200).json(response);
    });
}