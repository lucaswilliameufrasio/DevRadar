const { knex } = require("@/helpers/knex");
const parseStringAsArray = require("../utils/parseStringAsArray");

module.exports = {
  async index(req, res) {
    // Buscar todos os devs num raio de 10km
    // Filtrar por tecnologias

    const { latitude, longitude, techs } = req.query;

    const techsArray = parseStringAsArray(techs);

    const maxDistance = 10;

    const query = knex
      .table("devs")
      .whereRaw(
        `6371 * 2 * ASIN(
          SQRT(
              SIN(RADIANS(? - latitude) / 2) * SIN(RADIANS(? - latitude) / 2) +
              COS(RADIANS(?)) * COS(RADIANS(latitude)) *
              SIN(RADIANS(? - longitude) / 2) * SIN(RADIANS(? - longitude) / 2)
          )
      ) <= ?`,
        [latitude, latitude, latitude, longitude, longitude, maxDistance]
      )
      .andWhere(function () {
        const techConditions = techsArray
          .map(() => `JSON_EXTRACT(techs, '$') LIKE ?`)
          .join(" OR ");
        this.whereRaw(
          techConditions,
          techsArray.map((tech) => `%${tech}%`)
        );
      });

    const devs = await query;

    return res.json({
      devs: devs.map((dev) => ({
        ...dev,
        _id: dev.id,
        techs: JSON.parse(dev.techs),
        location: {
          coordinates: [dev.longitude, dev.latitude],
        },
      })),
    });
  },
};
