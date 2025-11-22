import con from "../utils/db/con.js";


export function get_feeds_list(req, res, next) {
    try {
        con.query('SELECT publication_title,publication_date FROM publications ORDER BY publication_title ASC;');
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching Financial Institution list:', err);
        res.status(500).json({ error: 'Failed to fetch Financial Institution list' });
    }

}


export async function get_feeds_info(req, res, next) {
    const { id } = req.params;

    try {
        const feed = await con.query(
            'SELECT publication_title, publication_date FROM publications WHERE publication_id = $1',
            [id]
        );

        const ref = await con.query(
            'SELECT ref_detail, ref_link FROM publication_reference WHERE publication_id = $1',
            [id]
        );

        const content = await con.query(
            'SELECT seq_no, content_detail FROM publication_content WHERE publication_id = $1 ORDER BY seq_no ASC',
            [id]
        );

        const type = await con.query(
            `SELECT pt.type_description 
             FROM publication_type_map AS ptm
             JOIN publication_type AS pt 
                 ON pt.publication_type_code = ptm.publication_type_code
             WHERE ptm.publication_id = $1`,
            [id]
        );

        const author = await con.query(
            `SELECT pa.author_name
             FROM publication_author_map AS pam
             JOIN publication_author AS pa
                 ON pa.author_id = pam.author_id
             WHERE pam.publication_id = $1`,
            [id]
        );

        res.json({
            ...feed.rows[0],               // title + date
            authors: author.rows,          // array of authors
            types: type.rows,              // array of types
            content: content.rows,         // ordered content list
            references: ref.rows,          // reference list
        });

    } catch (err) {
        console.error('Fetching Error:', err);
        res.status(500).json({ error: 'Failed to fetch feeds' });
    }
}

export async function insert_new_feed(req, res, next) {
    const client = await con.connect(); // if using a pool
    try {
        await client.query('BEGIN');

        const { title, date, authors = [], types = [], contents = [], references = [] } = req.body;

        // Step 1: Insert publication
        const pubRes = await client.query(
            'INSERT INTO publications (publication_title, publication_date) VALUES ($1, $2) RETURNING publication_id',
            [title, date]
        );
        const pubId = pubRes.rows[0].publication_id;

        // Helper for bulk insert with multiple columns
        const bulkInsertMulti = async (table, columns, values) => {
            if (!values || values.length === 0) return;

            const flatValues = values.flat();
            let placeholderIndex = 1;

            const placeholders = values.map(row => {
                const rowPlaceholders = row.map(() => `$${placeholderIndex++}`);
                return `(${rowPlaceholders.join(', ')})`;
            }).join(', ');

            const query = `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${placeholders}`;
            await client.query(query, flatValues);
        };

        // Step 2: Map authors, types, contents, references
        await bulkInsertMulti('publication_author', ['publication_id', 'author_id'], authors.map(id => [pubId, id]));
        await bulkInsertMulti('publication_type', ['publication_id', 'type_id'], types.map(id => [pubId, id]));
        await bulkInsertMulti(
            'publication_content',
            ['publication_id', 'content_detail', 'seq_no'],
            contents.map((c, index) => [pubId, c, index + 1]) // index + 1 is the seq_no
        );
        await bulkInsertMulti('publication_reference', ['publication_id', 'ref_detail'], references.map(r => [pubId, r]));

        await client.query('COMMIT');
        res.json({ success: true, publication_id: pubId });

    } catch (error) {
        await client.query('ROLLBACK');
        next(error);
    } finally {
        client.release();
    }
}

// Insert a new author
export async function insert_new_author(req, res, next) {
    const { author_name } = req.body;

    if (!author_name) {
        return res.status(400).json({ error: "author_name is required" });
    }

    try {
        const result = await con.query(
            'INSERT INTO publication_author (author_name) VALUES ($1) RETURNING author_id',
            [author_name]
        );

        res.json({ success: true, author_id: result.rows[0].author_id, author_name });
    } catch (error) {
        console.error("Error inserting new author:", error);
        res.status(500).json({ error: "Failed to insert new author" });
    }
}

// Insert a new publication type
export async function insert_new_type(req, res, next) {
    const { type_description } = req.body;

    if (!type_description) {
        return res.status(400).json({ error: "type_description is required" });
    }

    try {
        const result = await con.query(
            'INSERT INTO publication_type (type_description) VALUES ($1) RETURNING publication_type_code',
            [type_description]
        );

        res.json({ success: true, type_code: result.rows[0].publication_type_code, type_description });
    } catch (error) {
        console.error("Error inserting new type:", error);
        res.status(500).json({ error: "Failed to insert new publication type" });
    }
}


export async function patch_update_publication(req, res, next) {
    const client = await con.connect();
    try {
        const { publication_id } = req.params;
        const { title, date, authors, types, contents, references } = req.body;

        if (!publication_id) throw new Error("publication_id is required");

        await client.query("BEGIN");

        // --- Update main publication info ---
        const updateMap = {
            publication_title: title,
            publication_date: date
        };

        const fields = [];
        const values = [];
        let idx = 1;

        for (const [key, val] of Object.entries(updateMap)) {
            if (val !== undefined) {
                fields.push(`${key} = $${idx++}`);
                values.push(val);
            }
        }

        if (fields.length > 0) {
            values.push(publication_id);
            await client.query(
                `UPDATE publications SET ${fields.join(", ")} WHERE publication_id = $${idx}`,
                values
            );
        }

        // --- Authors ---
        if (Array.isArray(authors)) {
            // Remove existing authors and insert the new list
            await client.query("DELETE FROM publication_author_map WHERE publication_id = $1", [publication_id]);
            for (const author_id of authors) {
                await client.query(
                    "INSERT INTO publication_author_map (publication_id, author_id) VALUES ($1, $2)",
                    [publication_id, author_id]
                );
            }
        }

        // --- Types ---
        if (Array.isArray(types)) {
            await client.query("DELETE FROM publication_type_map WHERE publication_id = $1", [publication_id]);
            for (const type_id of types) {
                await client.query(
                    "INSERT INTO publication_type_map (publication_id, publication_type_code) VALUES ($1, $2)",
                    [publication_id, type_id]
                );
            }
        }

        // --- Contents ---
        if (Array.isArray(contents)) {
            await client.query("DELETE FROM publication_content WHERE publication_id = $1", [publication_id]);
            for (const [index, content] of contents.entries()) {
                await client.query(
                    "INSERT INTO publication_content (publication_id, content_detail, seq_no) VALUES ($1, $2, $3)",
                    [publication_id, content, index + 1]
                );
            }
        }

        // --- References ---
        if (Array.isArray(references)) {
            await client.query("DELETE FROM publication_reference WHERE publication_id = $1", [publication_id]);

            for (const ref of references.entries()) {
                const { ref_detail, ref_link } = ref;
                if (!ref_detail) continue;

                await client.query(
                    "INSERT INTO publication_reference (publication_id, ref_detail, ref_link) VALUES ($1, $2, $3)",
                    [publication_id, ref_detail, ref_link] // seq_no preserves order
                );
            }
        }


        await client.query("COMMIT");
        res.json({ message: "Publication updated successfully", publication_id });

    } catch (err) {
        await client.query("ROLLBACK");
        console.error("Error updating publication:", err);
        res.status(500).json({ error: "Failed to update publication" });
    } finally {
        client.release();
    }
}


// Update an existing author
export async function update_new_author(req, res, next) {
    const { author_id } = req.params;           // get author ID from URL
    const { author_name } = req.body;           // get new name from body

    if (!author_id || !author_name) {
        return res.status(400).json({ error: "author_id and author_name are required" });
    }

    try {
        await con.query(
            'UPDATE publication_author SET author_name = $1 WHERE author_id = $2',
            [author_name, author_id]
        );
        res.json({ success: true, author_id, author_name });
    } catch (error) {
        console.error("Error updating author:", error);
        res.status(500).json({ error: "Failed to update author" });
    }
}

// Update an existing publication type
export async function update_new_type(req, res, next) {
    const { type_code } = req.params;           // get type code from URL
    const { type_description } = req.body;      // get new description from body

    if (!type_code || !type_description) {
        return res.status(400).json({ error: "type_code and type_description are required" });
    }

    try {
        await con.query(
            'UPDATE publication_type SET type_description = $1 WHERE publication_type_code = $2',
            [type_description, type_code]
        );
        res.json({ success: true, type_code, type_description });
    } catch (error) {
        console.error("Error updating type:", error);
        res.status(500).json({ error: "Failed to update publication type" });
    }
}


// Delete a publication
export async function delete_new_feed(req, res, next) {
    const { publication_id } = req.params;

    if (!publication_id) {
        return res.status(400).json({ error: "publication_id is required" });
    }

    try {
        await con.query('DELETE FROM publications WHERE publication_id = $1', [publication_id]);
        res.json({ success: true, publication_id });
    } catch (error) {
        console.error("Error deleting publication:", error);
        res.status(500).json({ error: "Failed to delete publication" });
    }
}

// Delete an author
export async function delete_new_author(req, res, next) {
    const { author_id } = req.params;

    if (!author_id) {
        return res.status(400).json({ error: "author_id is required" });
    }

    try {
        await con.query('DELETE FROM publication_author WHERE author_id = $1', [author_id]);
        res.json({ success: true, author_id });
    } catch (error) {
        console.error("Error deleting author:", error);
        res.status(500).json({ error: "Failed to delete author" });
    }
}

// Delete a publication type
export async function delete_new_type(req, res, next) {
    const { type_code } = req.params;

    if (!type_code) {
        return res.status(400).json({ error: "type_code is required" });
    }

    try {
        await con.query('DELETE FROM publication_type WHERE publication_type_code = $1', [type_code]);
        res.json({ success: true, type_code });
    } catch (error) {
        console.error("Error deleting type:", error);
        res.status(500).json({ error: "Failed to delete publication type" });
    }
}
