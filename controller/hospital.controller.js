import con from "../con.js";

import arrayToJson from "../utils/converter/toJson.js";


export async function get_hospital_list(req, res, next) {
    try {
        const result = await con.query('SELECT * FROM health_insti ORDER BY health_insti_id ASC');
        res.json(result.rows); // send result back to the con
    } catch (err) {
        console.error('Error fetching hospital list:', err);
        res.status(500).json({ error: 'Failed to fetch hospital list' });
    }
}


export async function get_hospital_info(req, res, next) {

    const { id } = req.params;
    try {

        const hiResult = await con.query(`
        SELECT 
            hi.health_insti_id,
            hi.health_insti_name,
            prov.province_name,
            cities.city_name,
            barangays.brgy_name,
            Concat_ws(' ',TO_CHAR(ophr.service_start_time,'HH24:MI'), ophr.start_time_type_code) as StartTime,
            Concat_ws(' ',TO_CHAR(ophr.service_end_time,'HH24:MI'), ophr.end_time_type_code) as CloseTime
        FROM health_insti as hi
        LEFT JOIN insti_ophr as ophr ON ophr.health_insti_id = hi.health_insti_id
        LEFT JOIN provinces as prov ON prov.province_code = hi.provincial_code
        LEFT JOIN cities ON cities.city_zip_code = hi.city_zip_code
        LEFT JOIN barangays ON barangays.brgy_code = hi.brgy_code
        WHERE hi.health_insti_id = $1
            `, [id])


        const hiServicesResult = await con.query(`
           SELECT 
                his.service_id,
                his.service_name,
                his.service_desc,
                Concat_ws(' ',TO_CHAR(hso.service_start_time,'HH24:MI'), hso.start_time_type_code) as StartTime,
                Concat_ws(' ',TO_CHAR(hso.service_end_time,'HH24:MI'), hso.end_time_type_code) as CloseTime 
            FROM health_insti_services as his 
            LEFT JOIN health_service_ophr as hso on hso.service_id = his.service_id
            WHERE his.health_insti_id =$1
            `, [id]);

        const hiContactDetailsResults = await con.query(`
            SELECT 
                ct.contact_type_name, 
                hic.contact_detail 
            FROM health_insti_contacts as hic 
            JOIN contact_type as ct on ct.contact_type_id = hic.contact_type_id 
            WHERE hic.health_insti_id = $1`, [id])

        const ServiceID = hiServicesResult.rows[0].service_id;


        const hiServicesRequirements = await con.query(`
            SELECT 
                sr.req_name,
                sr.req_desc,
                sr.service_id
            FROM service_requirements as sr 
            WHERE service_id = $1`, [ServiceID])

        const hiServicesProcedure = await con.query(`
            SELECT 
                seq_no,
                procedure_name,
                procedure_desc,
                service_id
            FROM services_procedure
            where service_id = $1
            ORDER BY seq_no ASC`, [ServiceID])


        if (!hiResult || !hiResult.rows || hiResult.rows.length === 0) {
            return res.status(404).json({ error: 'Hospital not found' });
        }

        const servicesWithRequirements_Procedure = hiServicesResult.rows.length
            ? hiServicesResult.rows.map(service => ({
                ...service,
                Procedure: hiServicesProcedure.rows.filter(p => p.service_id === service.service_id) || null,
                Requirements: hiServicesRequirements.rows.filter(r => r.service_id === service.service_id) || null
            }))
            : null;


        res.json({
            ...hiResult.rows[0],
            Contacts_Details: hiContactDetailsResults.rows,
            Services_Offered: servicesWithRequirements_Procedure
        });
    } catch (err) {
        console.error('Error fetching hospital:', err);
        res.status(500).json({ error: 'Failed to fetch hospital' });
    }
}

export async function insert_hospital(req, res, next) {
    const client = await con.connect(); // Get a dedicated client for transaction
    try {
        await client.query('BEGIN'); // Start transaction

        const {
            health_insti_name,
            geo_latitude,
            geo_longhitude,
            city_zip_code,
            brgy_code,
            provincial_code,
            prk_code,
            op_hr,
            Contacts_Details,
            Services_Offered
        } = req.body;

        // Basic validation
        if (!health_insti_name || !geo_latitude || !geo_longhitude || !city_zip_code || !provincial_code) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Insert Hospital
        const hospitalResult = await client.query(
            `INSERT INTO health_insti (
                health_insti_name, geo_latitude, geo_longhitude, city_zip_code,
                brgy_code, provincial_code, purok_code
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7)
            RETURNING health_insti_id;`,
            [health_insti_name, geo_latitude, geo_longhitude, city_zip_code, brgy_code, provincial_code, prk_code]
        );

        const hospitalId = hospitalResult.rows[0].health_insti_id;
        console.log("Hospital inserted with ID:", hospitalId);

        // === Operating Hours ===
        if (Array.isArray(op_hr) && op_hr.length > 0) {
            for (const { service_start_time, service_end_time, service_day, start_time_type_code, end_time_type_code } of op_hr) {
                if (!service_start_time || !service_end_time || !service_day || !start_time_type_code || !end_time_type_code) continue;

                await client.query(
                    `INSERT INTO insti_ophr (
                        service_start_time, service_end_time, service_day,
                        start_time_type_code, end_time_type_code, health_insti_id
                    )
                    VALUES ($1, $2, $3, $4, $5, $6);`,
                    [service_start_time, service_end_time, service_day, start_time_type_code, end_time_type_code, hospitalId]
                );
            }
        }

        // === Contact Details ===
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
                    `INSERT INTO health_insti_contacts (health_insti_id, contact_type_id, contact_detail)
                     VALUES ($1, $2, $3);`,
                    [hospitalId, contactTypeId, contact_detail]
                );
            }
        }

        // === Services & Nested Data ===
        if (Array.isArray(Services_Offered) && Services_Offered.length > 0) {
            for (const service of Services_Offered) {
                const { service_name, service_desc, starttime, closetime, Procedure, Requirements } = service;
                if (!service_name || !service_desc) continue;

                const serviceResult = await client.query(
                    `INSERT INTO health_insti_services (service_name, service_desc, health_insti_id)
                     VALUES ($1, $2, $3)
                     RETURNING service_id;`,
                    [service_name, service_desc, hospitalId]
                );

                const serviceId = serviceResult.rows[0].service_id;

                // Procedures
                if (Array.isArray(Procedure) && Procedure.length > 0) {
                    for (const [index, { procedure_name, procedure_desc }] of Procedure.entries()) {
                        if (!procedure_name || !procedure_desc) continue;
                        const seqNo = index + 1;
                        await client.query(
                            `INSERT INTO services_procedure (service_id, procedure_name, procedure_desc, seq_no)
                             VALUES ($1, $2, $3, $4);`,
                            [serviceId, procedure_name, procedure_desc, seqNo]
                        );
                    }
                }

                // Requirements
                if (Array.isArray(Requirements) && Requirements.length > 0) {
                    for (const { req_name, req_desc } of Requirements) {
                        if (!req_name || !req_desc) continue;
                        await client.query(
                            `INSERT INTO service_requirements (service_id, req_name, req_desc)
                             VALUES ($1, $2, $3);`,
                            [serviceId, req_name, req_desc]
                        );
                    }
                }
            }
        }

        // ✅ Commit Transaction
        await client.query('COMMIT');
        res.status(201).json({
            message: "Hospital inserted successfully with all nested data",
            hospitalId
        });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Error inserting hospital:", err);
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
}

export async function update_hospital(req, res, next) {
  const client = await con.connect();
  try {
    const { id } = req.params;
    const {
      name,
      geo_latitude,
      geo_longhitude,
      city_zip_code,
      brgy_code,
      provincial_code,
      prk_code,
      contacts_details,
      op_hr,
      services
    } = req.body;

    await client.query("BEGIN");

    // --- Base hospital info update ---
    const updateMap = {
      health_insti_name: name,
      geo_latitude,
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
        `UPDATE health_insti SET ${fields.join(", ")} WHERE health_insti_id = $${i}`,
        values
      );
    }

    // --- Contact details ---
    if (Array.isArray(contacts_details)) {
      for (const c of contacts_details) {
        const { contact_id, contact_type_id, contact_detail } = c;
        if (!contact_type_id || !contact_detail) continue;

        if (contact_id) {
          await client.query(
            `UPDATE health_insti_contacts
             SET contact_type_id = $1, contact_detail = $2
             WHERE contact_id = $3 AND health_insti_id = $4`,
            [contact_type_id, contact_detail, contact_id, id]
          );
        } else {
          await client.query(
            `INSERT INTO health_insti_contacts (health_insti_id, contact_type_id, contact_detail)
             VALUES ($1, $2, $3)`,
            [id, contact_type_id, contact_detail]
          );
        }
      }
    }

    // --- Operating hours ---
    if (Array.isArray(op_hr)) {
      for (const hr of op_hr) {
        const {
          insti_ophr_id, // use the real column name if it exists
          service_start_time,
          service_end_time,
          service_day,
          start_time_type_code,
          end_time_type_code
        } = hr;

        if (insti_ophr_id) {
          // Update existing
          await client.query(
            `UPDATE insti_ophr
             SET service_start_time = COALESCE($1, service_start_time),
                 service_end_time = COALESCE($2, service_end_time),
                 service_day = COALESCE($3, service_day),
                 start_time_type_code = COALESCE($4, start_time_type_code),
                 end_time_type_code = COALESCE($5, end_time_type_code)
             WHERE insti_ophr_id = $6 AND health_insti_id = $7`,
            [
              service_start_time,
              service_end_time,
              service_day,
              start_time_type_code,
              end_time_type_code,
              insti_ophr_id,
              id
            ]
          );
        } else {
          // Insert new
          await client.query(
            `INSERT INTO insti_ophr (
               service_start_time,
               service_end_time,
               service_day,
               start_time_type_code,
               end_time_type_code,
               health_insti_id
             ) VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              service_start_time,
              service_end_time,
              service_day,
              start_time_type_code,
              end_time_type_code,
              id
            ]
          );
        }
      }
    }

    // --- Services, Requirements, and Procedures ---
    if (Array.isArray(services)) {
      for (const svc of services) {
        const {
          service_id,
          service_name,
          service_desc,
          requirements,
          procedure
        } = svc;

        let currentServiceId = service_id;

        if (service_id) {
          await client.query(
            `UPDATE health_insti_services
             SET service_name = $1, service_desc = $2
             WHERE service_id = $3 AND health_insti_id = $4`,
            [service_name, service_desc, service_id, id]
          );
        } else {
          const svcRes = await client.query(
            `INSERT INTO health_insti_services (service_name, service_desc, health_insti_id)
             VALUES ($1, $2, $3)
             RETURNING service_id`,
            [service_name, service_desc, id]
          );
          currentServiceId = svcRes.rows[0].service_id;
        }

        // --- Requirements --
        if (Array.isArray(requirements)) {
          for (const req of requirements) {
            const { req_id, req_name, req_desc } = req;
            if (!req_name || !req_desc) continue;

            if (req_id) {
              await client.query(
                `UPDATE service_requirements
                 SET req_name = $1, req_desc = $2
                 WHERE req_id = $3 AND service_id = $4`,
                [req_name, req_desc, req_id, currentServiceId]
              );
            } else {
              await client.query(
                `INSERT INTO service_requirements (service_id, req_name, req_desc)
                 VALUES ($1, $2, $3)`,
                [currentServiceId, req_name, req_desc]
              );
            }
          }
        }

        // --- Procedures ---
        if (Array.isArray(procedure)) {
          for (const [index, proc] of procedure.entries()) {
            const { procedure_id, procedure_name, procedure_desc } = proc;
            if (!procedure_name || !procedure_desc) continue;

            if (procedure_id) {
              await client.query(
                `UPDATE services_procedure
                 SET procedure_name = $1, procedure_desc = $2, seq_no = $3
                 WHERE procedure_id = $4 AND service_id = $5`,
                [procedure_name, procedure_desc, index + 1, procedure_id, currentServiceId]
              );
            } else {
              await client.query(
                `INSERT INTO services_procedure (service_id, procedure_name, procedure_desc, seq_no)
                 VALUES ($1, $2, $3, $4)`,
                [currentServiceId, procedure_name, procedure_desc, index + 1]
              );
            }
          }
        }
      }
    }

    await client.query("COMMIT");
    res.json({ message: "Hospital updated successfully", hospitalId: id });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error updating hospital:", err);
    res.status(500).json({ error: "Failed to update hospital" });
  } finally {
    client.release();
  }
}

export async function delete_hospital(req, res, next) {
    try {
        const { id } = req.params;
        const result = await con.query('DELETE FROM health_insti WHERE health_insti_id = $1 RETURNING *', [id]);

        if (!result || result.rowCount === 0) {
            return res.status(404).json({ error: 'Hospital not found' });
        }
        res.json({ message: 'Hospital deleted successfully', hospital: result.rows[0] });
    } catch (err) {
        console.error('Error deleting hospital:', err);
        res.status(500).json({ error: 'Failed to delete hospital' });
    }
}