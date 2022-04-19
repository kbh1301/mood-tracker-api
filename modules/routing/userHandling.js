// handle calls relating to users
module.exports = (app, validateUser, crypto, dbQuery) => {

    // if user is Demo during login, check if new demo data is necessary and generate it if so
    const generateDemoData = (id, yesterday_datetz, yesterday_tz, res) => {

        // run db query to check if data is already current for last 90 days
        const yesterdayQuery = `SELECT EXISTS(SELECT 1 FROM entries WHERE user_id=${id} AND '${yesterday_datetz}' IN (time_am::timestamptz, time_pm::timestamptz))`;
        dbQuery(yesterdayQuery, (err, result) => {
            if(err) {
                console.trace(err);
                return res.status(400).json('Error validating Demo user data');
            };
            // used to check if query found an entry for yesterday in the db
            let yesterdayExists = result.rows[0].exists || false;

            // if demo data is not current, generate data for past 90 days
            if(!yesterdayExists) {
                // random # between 1-7 for mood/anxiety
                const ranNum = '6*random()+1';
                // create notes and encrypt
                let notes = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.';
                notes = crypto.encrypt(notes);

                // returns string for insertion into time columns
                const queryTimeInput = (interval) => `to_char('${yesterday_datetz}'::timestamptz + ((-DAY)||' days${interval}')::interval, 'YYYY-MM-DD"T"HH24:MI ') || '${yesterday_tz}'`;
                // deletes existing demo data, sets db timezone to tz variable, generates rows of dummy data for 90 days prior to today, and inserts into db
                const generationQuery = `
                    DELETE FROM entries WHERE user_id=${id};
                    SET LOCAL timezone='${yesterday_tz}';
                    INSERT INTO entries(time_am, mood_am, anxiety_am, notes_am, time_pm, mood_pm, anxiety_pm, notes_pm, user_id)
                    SELECT ${queryTimeInput('')}, ${ranNum}, ${ranNum}, '${notes}', ${queryTimeInput(' 12 hours')}, ${ranNum}, ${ranNum}, '${notes}', '${id}'
                    FROM generate_series(0, 89, 1) DAY;
                `;

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
            const { id, yesterday_datetz, yesterday_tz } = req.body;
            generateDemoData(id, yesterday_datetz, yesterday_tz, res);
        };

        // if user is valid, send new tokens to frontend
        const response = {token: token, refreshToken: refreshToken};
        return res.status(200).json(response);
    });
}