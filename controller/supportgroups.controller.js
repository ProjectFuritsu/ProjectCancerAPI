import con from "../db/connection.js";

/**
 * ? The following tables are included in these functions:
 * ? support_groups, support_groups_details, support_groups_founders, group_type
 * 
 * 
 */

export async function get_sg_list(req, res, next) {
  try {
    const result = await con.query(`
      SELECT 
        support_groups.support_group_id,
        support_groups.group_name, 
        group_type.group_type_name, 
        cities.city_name,
        barangays.brgy_name,
        provinces.province_name
      FROM support_groups  
      JOIN cities 
        ON cities.city_zip_code = support_groups.city_zip_code 
      JOIN barangays 
        ON barangays.brgy_code = support_groups.brgy_code 
      JOIN provinces 
        ON provinces.province_code = support_groups.province_code 
      JOIN group_type 
        ON group_type.group_type_code = support_groups.group_type_code 
      ORDER BY support_groups.support_group_id ASC
    `);

    res.json({
      success: true,
      data: result.rows
    });

  } catch (error) {
    console.error("Get SG List Error:", error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

export async function get_sg_details(req, res, next) {
  try {
    const { SGID } = req.params;

    if (!SGID) {
      return res.status(400).json({ error: "Group ID is required" });
    }

    const result = await con.query(
      `
        SELECT 
          sg.support_group_id,
          sg.group_name, 
          sf.founder_name, 
          sg.group_started_date, 
          sg.group_socmed_link, 
          cities.city_name, 
          barangays.brgy_name,
          provinces.province_name
        FROM support_groups AS sg
        JOIN cities 
          ON cities.city_zip_code = sg.city_zip_code
        JOIN barangays 
          ON barangays.brgy_code = sg.brgy_code
        JOIN provinces 
          ON provinces.province_code = sg.province_code
        JOIN (
          SELECT founder_id, founder_name 
          FROM support_group_founders 
          WHERE is_current_head = true
        ) AS sf 
          ON sf.founder_id = sg.founders_id
        WHERE sg.support_group_id = $1
      `,
      [SGID]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Support group not found" });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });

  } catch (error) {
    console.error("Get SG Details Error:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

export async function insert_sg(req, res, next) {
  try {
    const {
      name,
      date_started,
      type,
      group_socmed_link,
      geo_latitude,
      geo_longhitude,
      city_zip_code,
      brgy_code,
      provincial_code,
      purok_code,
      founder,
      contents = []
    } = req.body;

    await con.query('BEGIN');

    const supportgroupResult = await con.query('INSERT INTO support_groups(group_name, group_type_code, group_started_date, group_socmed_link, geo_latitude, geo_longhitude, city_zip_code, brgy_code, purok_code, province_code, founders_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING support_group_id', [name, type, date_started, group_socmed_link, geo_latitude, geo_longhitude, city_zip_code, brgy_code, purok_code, provincial_code, founder]);

    const support_group_id = supportgroupResult.rows[0].support_group_id;

    if (Array.isArray(contents) && contents.length > 0) {
      for (const [index, { group_detail }] of contents.entries()) {
        if (!group_detail) continue;

        // Ensure contact type exists
        const seqNo = index + 1;
        await con.query('INSERT INTO support_group_details (group_detail, seq_no, support_group_id) VALUES($1, $2, $3)', [group_detail, seqNo, support_group_id])
      }
    }

    await con.query('COMMIT');
    res.status(201).json({
      message: "Support Group inserted successfully",
      support_group_id
    });
  } catch (error) {
    await con.query('ROLLBACK');
    console.error("Insertion Error:", error);
    res.status(500).json({ error: error.message });
  }
}


export async function insert_new_founder(req, res, next) {
  try {
    const {name, isCurrentHead, is_already_head, headStartDate, headEnddate} = req.body
    await con.query('BEGIN')

    const founderResult = await con.query('INSERT INTO support_group_founders(founder_name, is_current_head, is_already_head, head_start_date, head_end_date)VALUES ($1,$2,$3,$4,$5) RETURNING founder_id', [name, isCurrentHead, is_already_head, headStartDate, headEnddate]);

     const founder_id = founderResult.rows[0].founder_id;

    res.status(201).json({
      message: "Founder added successfully",
      founder_id
    });
    await con.query('COMMIT');

  } catch (err) {
    await con.query('ROLLBACK');
    console.error("Error inserting Founder:", err);
    res.status(500).json({ error: err.message });
  }
}

export async function update_sg(req, res, next) {
  try {
    const { SGID } = req.params;

    if (!SGID) {
      return res.status(400).json({ error: "Group ID is required" });
    }

    const {
      name,
      date_started,
      type,
      group_socmed_link,
      geo_latitude,
      geo_longhitude,
      city_zip_code,
      brgy_code,
      provincial_code,
      purok_code,
      founder,
      contents = []
    } = req.body;

    await con.query("BEGIN");

    // Update main support_group table
    await con.query(
      `
        UPDATE support_groups
        SET 
          group_name = $1,
          group_type_code = $2,
          group_started_date = $3,
          group_socmed_link = $4,
          geo_latitude = $5,
          geo_longhitude = $6,
          city_zip_code = $7,
          brgy_code = $8,
          purok_code = $9,
          province_code = $10,
          founders_id = $11
        WHERE support_group_id = $12
      `,
      [
        name,
        type,
        date_started,
        group_socmed_link,
        geo_latitude,
        geo_longhitude,
        city_zip_code,
        brgy_code,
        purok_code,
        provincial_code,
        founder,
        SGID
      ]
    );

    // Rebuild details (same pattern as insert)
    await con.query(
      `DELETE FROM support_group_details WHERE support_group_id = $1`,
      [SGID]
    );

    if (Array.isArray(contents) && contents.length > 0) {
      for (let index = 0; index < contents.length; index++) {
        const { group_detail } = contents[index];
        if (!group_detail) continue;

        const seqNo = index + 1;

        await con.query(
          `INSERT INTO support_group_details (group_detail, seq_no, support_group_id)
           VALUES ($1, $2, $3)`,
          [group_detail, seqNo, SGID]
        );
      }
    }

    await con.query("COMMIT");

    res.json({
      message: "Support Group updated successfully",
      support_group_id: SGID
    });

  } catch (error) {
    await con.query("ROLLBACK");
    console.error("Update Error:", error);
    res.status(500).json({ error: error.message });
  }
}

export async function delete_sg(req, res, next) {
  try {
    const { SGID } = req.params;

    await con.query('BEGIN');
    const result = await con.query('DELETE FROM public.support_groups WHERE support_group_id = $1;', [SGID]);


    if (result.rowCount === 0) {
      // No record found with that ID
      return res.status(404).json({ message: 'Support group not found' });
    }


    await con.query('COMMIT');
    return res.status(200).json({ message: 'Support group deleted successfully', deleted: result.rows[0] });
  } catch (error) {
    console.error('Error deleting support group:', error);
    await con.query('ROLLBACK');
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
}
