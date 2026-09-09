import bcrypt from 'bcrypt';
const saltRounds = 10;

export const hashPasswordHelper = async (plainPassword: string) => {
  try {
    return await bcrypt.hash(plainPassword, saltRounds);
  } catch (error) {
    console.error(error);
  }
};

export const comparePasswordHelper = async (
  plainPassword: string,
  hashedPassword: string,
) => {
  try {
    return await bcrypt.compare(plainPassword, hashedPassword);
  } catch (error) {
    console.error('Password is not correct', error);
  }
};
