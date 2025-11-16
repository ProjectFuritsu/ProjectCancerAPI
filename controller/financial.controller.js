import con from "../utils/db/con.js";



/**
 * 
 * 
 * * This is also done 
 * 
 */
export async function get_financial_Insti_list(req, res, next) {
    try {
        const result = await con.query('SELECT financial_insti_id, financial_insti_name FROM financial_institution ORDER BY financial_insti_id ASC');
        res.json(result.rows); // send result back to the client
    } catch (err) {
        console.error('Error fetching Financial Institution list:', err);
        res.status(500).json({ error: 'Failed to fetch Financial Institution list' });
    }
}




/**
 * 
 * * This is finished and needs optimization and documentation
 * 
 */
export async function get_financial_Insti_info(req, res, next) {

    const { id } = req.params;
    try {
        const fiResult = await con.query(`
            SELECT 	
                fi.financial_insti_id,
                fi.financial_insti_name,
                fi.geo_latitutde,
                fi.geo_longhitude,
                prov.province_name,
                cities.city_name,
                barangays.brgy_name,
                Concat_ws(' ',TO_CHAR(ophr.service_start_time,'HH24:MI'), ophr.start_time_type_code) as StartTime,
                Concat_ws(' ',TO_CHAR(ophr.service_end_time,'HH24:MI'), ophr.end_time_type_code) as CloseTime
            FROM financial_institution as fi
            JOIN financial_insti_ophr as ophr on ophr."financial_insti_ID" = fi.financial_insti_id
            JOIN provinces as prov ON prov.province_code = fi.province_code
            JOIN cities ON cities.city_zip_code = fi.city_zip_code
            JOIN barangays ON barangays.brgy_code = fi.brgy_code
            WHERE fi.financial_insti_id = $1
        `, [id]);

        const fiprogramsResult = await con.query(`
            SELECT 
                program_id,
                program_name,
                program_desc
            FROM program_offers
            WHERE financial_insti_id = $1
        `, [id]);

        // Build programs array with extra details
        const programs = [];
        for (const program of fiprogramsResult.rows) {
            const [programProceedure, programBenefits, programRequirements] = await Promise.all([
                con.query(`
                    SELECT seq_no, program_steps_name, program_steps_desc 
                    FROM program_offer_steps
                    WHERE program_id = $1 
                    ORDER BY seq_no
                `, [program.program_id]),
                con.query(`
                    SELECT program_id, benef_name, benef_desc 
                    FROM program_benefits
                    WHERE program_id = $1
                    ORDER BY benef_id
                `, [program.program_id]),
                con.query(`
                    SELECT program_id, req_name, req_details 
                    FROM program_requirements
                    WHERE program_id = $1
                    ORDER BY program_req_id
                `, [program.program_id])
            ]);

            programs.push({
                ...program,
                Requirements: programRequirements.rows,
                Benefits: programBenefits.rows,
                Procedure: programProceedure.rows
            });
        }

        if (!fiResult.rows.length) {
            return res.status(404).json({ error: 'Financial Institution not found' });
        }

        res.json({
            ...fiResult.rows[0],
            Programs: programs
        });
    } catch (err) {
        console.error('Error fetching Financial Institution:', err);
        res.status(500).json({ error: 'Failed to fetch Financial Institution' });
    }
}

/**
 * 
 * @param { Details of a financial Institution [name, ophr, programs, etc]} req 
 * @param {status codes} res 
 * @returns status code of 201
 * 
 * TODO NEXT TASK
 */
export async function insert_financial_Insti(req, res, next) {

    try {
        const { name, geo_latitude, geo_longhitude, city_zip_code, brgy_code, provincial_code, purok_code } = req.body;

        if (!name || !geo_latitude || !geo_longhitude || !city_zip_code || !provincial_code) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const FinancialInstiresult = await con.query(
           `INSERT INTO financial_institution(
            financial_insti_name, geo_latitutde, geo_longhitude, city_zip_code, brgy_code, purok_code, province_code)
            VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
            [name, geo_latitude, geo_longhitude, city_zip_code, brgy_code, provincial_code, purok_code]
        );

        const FinancialInsiId = FinancialInstiresult.rows[0].financial_insti_id;

        /*
        ! TODO: These are the following Query that needs to add in the insertion of a instance of Financial Insti
        * Insert to Financial Institution Table
        INSERT INTO financial_institution(
            financial_insti_name, geo_latitutde, geo_longhitude, city_zip_code, brgy_code, purok_code, province_code)
            VALUES ( $1,$2,$3,$4,$5,$6,$7) RETURNING *;

        * Insert to Financial Contact Details
        INSERT INTO financial_contact_details(
            contact_details_id, contact_detail, contact_type_id, financial_insti_id)
            VALUES ($1, $2, $3, $4);

        * Insert to Financial Operating Hours
        INSERT INTO financial_insti_ophr(
            service_start_time, service_end_time, service_day, start_time_type_code, end_time_type_code, financial_insti_ID)
            VALUES ($1,$2,$3,$4,$5,$6);
        
        * Insert Programs of Financial Insti
        INSERT INTO program_offers(
            program_name, program_desc, financial_insti_id, eligibility_id)
            VALUES ($1,$2,$3,$4) RETURNING *;

        * Insert Benefits of a Program
        INSERT INTO program_benefits(
            benef_name, benef_desc, program_id)
            VALUES ($1,$2,$3);

        * Insert Requirements of a Program
        INSERT INTO program_requirements(
            req_name, req_details, program_id)
            VALUES ($1,$2,$3);
        
        */

        // return the inserted row and its primary key - adjust field name if your PK is `health_insti_id`
        const inserted = result && result.rows && result.rows[0];
        const insertedId = inserted ? (inserted.health_insti_id || inserted.id) : null;
        res.status(201).json({
            message: 'Hospital added successfully',
            hospital: inserted,
            hospitalId: insertedId
        });
    } catch (err) {
        console.error('Error inserting hospital:', err);
        res.status(500).json({ error: 'Failed to insert hospital' });
    }
}

/**
 * 
 * @param {*} req 
 * @param {*} res 
 * @param {*} next 
 * @returns 
 */
export async function update_financial_Insti(req, res, next) {
    const { id } = req.params;
    const { name, geo_latitude, geo_longhitude, city_zip_code, brgy_code, provincial_code, purok_code } = req.body;

    if (!name || !geo_latitude || !geo_longhitude || !city_zip_code || !provincial_code) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        const result = await con.query(
            `UPDATE health_insti 
                SET health_insti_name = $1, geo_latitude = $2, geo_longhitude = $3, city_zip_code = $4, brgy_code = $5, provincial_code = $6, purok_code = $7
                WHERE health_insti_id = $8 RETURNING *;`,
            [name, geo_latitude, geo_longhitude, city_zip_code, brgy_code, provincial_code, purok_code, id]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Hospital not found' });
        }
        res.json({ message: 'Hospital updated successfully', hospital: result.rows[0] });
    } catch (err) {
        console.error('Error updating hospital:', err);
        res.status(500).json({ error: 'Failed to update hospital' });
    }
}

export async function delete_financial_Insti(req, res, next) {
    const { id } = req.params;

    try {
        const result = await con.query('DELETE FROM health_insti WHERE health_insti_id = $1 RETURNING *;', [id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Hospital not found' });
        }
        res.json({ message: 'Hospital deleted successfully', hospital: result.rows[0] });
    } catch (err) {
        console.error('Error deleting hospital:', err);
        res.status(500).json({ error: 'Failed to delete hospital' });
    }
}



