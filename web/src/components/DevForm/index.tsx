import React, { useEffect, useState } from 'react';
import './styles.css';

function DevForm({ onSubmit }: {
  onSubmit: (data: {
    github_username: string;
    techs: string;
    latitude: number;
    longitude: number;
  }) => Promise<void>
}) {
  const [github_username, setGithubUsername] = useState('');
  const [techs, setTechs] = useState('');
  const [latitude, setLatitude] = useState<number>(0);
  const [longitude, setLongitude] = useState<number>(0);

  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        console.log('coordinates', position.coords)
        const { latitude, longitude } = position.coords;

        setLatitude(latitude);
        setLongitude(longitude);
      },
      (error) => {
        console.log('Failed to load current position', error);
      },
      { enableHighAccuracy: false, maximumAge: 100, timeout: 50_000 },
    );
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    await onSubmit({
      github_username,
      techs,
      latitude,
      longitude
    });

    setGithubUsername('');
    setTechs('');
  }

  return (
    <form onSubmit={(event) => handleSubmit(event)}>
      <div className="input-block">
        <label htmlFor="github_username">Usuário do Github</label>
        <input
          name="github_username"
          id="github_username"
          required
          value={github_username}
          onChange={e => setGithubUsername(e.target.value)}
        />
      </div>

      <div className="input-block">
        <label htmlFor="techs">Tecnologias</label>
        <input
          name="techs"
          id="techs"
          required
          value={techs}
          onChange={e => setTechs(e.target.value)}
        />
      </div>

      <div className="input-group">
        <div className="input-block">
          <label htmlFor="latitude">Latitude</label>
          <input
            type="number"
            name="latitude"
            id="latitude"
            required
            value={latitude}
            onChange={(event) => setLatitude(event.target.value?.length ? Number(event.target.value) : 0)}
          />
        </div>

        <div className="input-block">
          <label htmlFor="longitude">Longitude</label>
          <input
            type="number"
            name="longitude"
            id="longitude"
            required
            value={longitude}
            onChange={(event) => setLongitude(event.target.value?.length ? Number(event.target.value) : 0)}
          />
        </div>
      </div>

      <button type="submit">Salvar</button>
    </form>
  )
}

export default DevForm;