module.exports = async function getDevInformation(username) {
  const response = await fetch(`https://api.github.com/users/${username}`);

  const result = await response.json();

  return result;
};
