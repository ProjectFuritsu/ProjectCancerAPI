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
            JOIN financial_insti_ophr as ophr on ophr."financial_insti_id" = fi.financial_insti_id
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
            const [programBenefits, programRequirements] = await Promise.all([
                con.query(`
                    SELECT benef_name, benef_desc 
                    FROM program_benefits
                    WHERE program_id = $1
                    ORDER BY benef_id
                `, [program.program_id]),
                con.query(`
                    SELECT req_name, req_details 
                    FROM program_requirements
                    WHERE program_id = $1
                    ORDER BY program_req_id
                `, [program.program_id])
            ]);

            programs.push({
                ...program,
                Requirements: programRequirements.rows,
                Benefits: programBenefits.rows
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
    const client = await con.connect();
    try {
        await client.query('BEGIN');

        const { name, geo_latitude, geo_longhitude, city_zip_code, brgy_code, provincial_code, purok_code, Contacts_Details, op_hr, program_offers } = req.body;

        if (!name || !geo_latitude || !geo_longhitude || !city_zip_code || !provincial_code) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const FinancialInstiresult = await con.query(
            `INSERT INTO financial_institution(
            financial_insti_name, geo_latitutde, geo_longhitude, city_zip_code, brgy_code, purok_code, province_code)
            VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING financial_insti_id`,
            [name, geo_latitude, geo_longhitude, city_zip_code, brgy_code, purok_code, provincial_code]
        );

        const FinancialInsiId = FinancialInstiresult.rows[0].financial_insti_id;

        // ! === Contact Details ===
        if (Array.isArray(Contacts_Details) && Contacts_Details.length > 0) {
            for (const { contact_type_name, contact_detail } of Contacts_Details) {
                if (!contact_type_name || !contact_detail) continue;

                // Ensure contact type exists
                const contactTypeResult = await client.query(
                    `SELECT contact_type_id FROM contact_type WHERE LOWER(contact_type_name) = LOWER($1);`,
                    [contact_type_name]
                );

                let contactTypeId;
                if (contactTypeResult.rows.length === 0) {
                    const insertType = await client.query(
                        `INSERT INTO contact_type (contact_type_name)
                            VALUES ($1)
                            RETURNING contact_type_id;`,
                        [contact_type_name]
                    );
                    contactTypeId = insertType.rows[0].contact_type_id;
                } else {
                    contactTypeId = contactTypeResult.rows[0].contact_type_id;
                }

                await client.query(
                    `INSERT INTO financial_contact_details(
                        contact_detail, contact_type_id, financial_insti_id)
                        VALUES ($1, $2, $3);`,
                    [contact_detail, contactTypeId, FinancialInsiId]
                );
            }
        }

        // !  // === Operating Hours ===
        if (Array.isArray(op_hr) && op_hr.length > 0) {
            for (const { service_start_time, service_end_time, service_day, start_time_type_code, end_time_type_code } of op_hr) {
                if (!service_start_time || !service_end_time || !service_day || !start_time_type_code || !end_time_type_code) continue;

                await client.query(
                    `INSERT INTO financial_insti_ophr(service_start_time, service_end_time, service_day, start_time_type_code, end_time_type_code, financial_insti_ID) VALUES ($1,$2,$3,$4,$5,$6);`,
                    [service_start_time, service_end_time, service_day, start_time_type_code, end_time_type_code, FinancialInsiId]
                );
            }
        }

        if (Array.isArray(program_offers) && program_offers.length > 0) {
            for (const program of program_offers) {
                const { program_name, program_desc, eligibility_id, benefits, requirements } = program;
                if (!program_name || !program_desc) continue;

                const program_offersResult = await client.query(
                    `INSERT INTO program_offers(
                    program_name, program_desc, financial_insti_id, eligibility_id)
                    VALUES ($1,$2,$3,$4) RETURNING *;`,
                    [program_name, program_desc, FinancialInsiId, eligibility_id]
                );

                const programId = program_offersResult.rows[0].program_id;


                // Insert benefits
                if (Array.isArray(benefits) && benefits.length > 0) {
                    for (const { benef_name, benef_desc } of benefits) {
                        if (!benef_name || !benef_desc) continue;
                        await client.query(
                            `INSERT INTO program_benefits(benef_name, benef_desc, program_id) VALUES ($1,$2,$3)`,
                            [benef_name, benef_desc, programId]
                        );
                    }
                }

                // Insert requirements
                if (Array.isArray(requirements) && requirements.length > 0) {
                    for (const { req_name, req_desc } of requirements) {
                        if (!req_name || !req_desc) continue;
                        await client.query(
                            `INSERT INTO program_requirements(req_name, req_details, program_id) VALUES ($1,$2,$3)`,
                            [req_name, req_desc, programId]
                        );
                    }
                }

            }
        }

        await client.query('COMMIT');
        res.status(201).json({
            message: "A new Financial Institutio was inserted successfully with all nested data",
            FinancialInsiId
        });


    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Insertion Error:", err);
        res.status(500).json({ Error: err.message });
    } finally {
        client.release();
    }
}


export async function update_financial_Insti(req, res, next) {

    const client = await con.connect();


    try {
        const { id } = req.params;
        const {
            name,
            geo_latitutde,
            geo_longhitude,
            city_zip_code,
            brgy_code,
            provincial_code,
            prk_code,
            contacts_details,
            op_hr,
            program_offers
        } = req.body;

        await client.query("BEGIN");


        // --- Base hospital info update ---
        const updateMap = {
            financial_insti_name: name,
            geo_latitutde,
            geo_longhitude,
            city_zip_code,
            brgy_code,
            provincial_code,
            purok_code: prk_code
        };


        const fields = [];
        const values = [];
        let i = 1;

        for (const [key, val] of Object.entries(updateMap)) {
            if (val !== undefined) {
                fields.push(`${key} = $${i++}`);
                values.push(val);
            }
        }

        if (fields.length > 0) {
            values.push(id);
            await client.query(
                `UPDATE financial_institution SET ${fields.join(", ")} WHERE financial_insti_id = $${i}`,
                values
            );
        }



        if (Array.isArray(contacts_details)) {
            for (const c of contacts_details) {
                const { contact_id, contact_type_id, contact_detail } = c;
                if (!contact_type_id || !contact_detail) continue;

                if (contact_id) {
                    await client.query(
                        `UPDATE public.financial_contact_details
                        SET contact_details_id=$1, contact_detail=$2
                        WHERE contact_details_id=$3 and financial_insti_id =$4;`,
                        [contact_type_id, contact_detail, contact_id, id]
                    );
                } else {
                    await client.query(
                        `INSERT INTO financial_contact_details(
                        contact_detail, contact_type_id, financial_insti_id)
                        VALUES ($1, $2, $3);`,
                        [contact_detail, contact_type_id, id]
                    );
                }
            }
        }

        if (Array.isArray(op_hr)) {
            for (const c of op_hr) {
                const { service_start_time, service_end_time, service_day, start_time_type_code, end_time_type_code } = c;
                if (!service_start_time || !service_end_time || !service_day || !start_time_type_code || !end_time_type_code) continue;

                if (contact_id) {
                    await client.query(
                        `UPDATE public.financial_contact_details
                        SET contact_details_id=$1, contact_detail=$2
                        WHERE contact_details_id=$3 and financial_insti_id =$4;`,
                        [contact_type_id, contact_detail, contact_id, id]
                    );
                } else {
                    await client.query(
                        `INSERT INTO financial_insti_ophr(
                    service_start_time, service_end_time, service_day, start_time_type_code, end_time_type_code, financial_insti_ID)
                    VALUES ($1,$2,$3,$4,$5,$6);`,
                        [service_start_time, service_end_time, service_day, start_time_type_code, end_time_type_code, id]
                    );
                }
            }
        }



        if (Array.isArray(program_offers)) {
            for (const prg of program_offers) {
                const { program_id, program_name, program_desc, eligibility_id, benefits, requirements } = prg;

                let currentprogramid = program_id;

                if (service_id) {
                    await client.query(
                        `UPDATE program_offers
                        SET program_name = $1, program_desc = $2, eligibility_id = $3
                        WHERE program_id = $4 AND financial_insti_id = $5`,
                        [program_name, program_desc, eligibility_id, program_id, id]
                    );
                } else {
                    const svcRes = await client.query(
                        `INSERT INTO program_offers (program_name, program_desc, financial_insti_id)
                        VALUES ($1, $2, $3)
                        RETURNING program_id`,
                        [program_name, program_desc, id]
                    );
                    currentprogramid = svcRes.rows[0].program_id;
                }

                if (Array.isArray(requirements)) {
                    for (const req of requirements) {
                        const { req_id, req_name, req_desc } = req;
                        if (!req_name || !req_desc) continue;


                        if (req_id) {
                            await client.query(
                                `UPDATE program_requirements
                                SET req_name=$1, req_details=$2 WHERE program_req_id = $3 AND program_id = $4`,
                                [req_name, req_desc, req_id, currentprogramid]
                            );
                        } else {
                            await client.query(
                                `INSERT INTO program_requirements(req_name, req_details, program_id)
                                    VALUES ($1,$2,$3);`,
                                [req_name, req_desc, currentprogramid]
                            );
                        }
                    }
                }

                if (Array.isArray(benefits)) {
                    for (const benif of benefits) {
                        const { benef_id, benef_name, benef_desc } = benif;
                        if (!benef_name || !benef_desc) continue;

                        if (benef_id) {
                            await client.query(
                                `UPDATE public.program_benefits
                                SET benef_name=$1, benef_desc=$2
                                WHERE benef_id = $3 and program_id = $4;`,
                                [benef_name, benef_desc, benef_id, currentprogramid]
                            );
                        } else {
                            await client.query(
                                `INSERT INTO program_benefits(benef_name, benef_desc, program_id)
                                VALUES ($1,$2,$3);`,
                                [benef_name, benef_desc, currentprogramid]
                            );
                        }
                    }
                }
            }
        }

        await client.query("COMMIT");
        res.json({ message: "A Financial Insitution data was updated successfully", FinancialInsiId: id });
    } catch (err) {
        await client.query("ROLLBACK");
        console.error("Patch Error:", err);
        res.status(500).json({ error: "Failed to update financial institution" });
    } finally {
        client.release();
    }
}

export async function delete_financial_Insti(req, res, next) {
    const { id } = req.params;

    try {
        const result = await con.query('DELETE FROM financial_institution WHERE financial_insti_id = $1;', [id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Institution not found' });
        }
        res.json({ message: 'Financial Institution deleted successfully', hospital: result.rows[0] });

    } catch (err) {
        console.error('Deletion Error:', err);
        res.status(500).json({ error: 'Failed to delete a financial institution' });
    }
}



