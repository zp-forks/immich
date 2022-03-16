import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFacialDetectionFlagToAssetsTable1647459396756 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
        ALTER TABLE assets
          ADD COLUMN "isFaceDetected" bool DEFAULT false;
      `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE assets
      DROP COLUMN "isFaceDetected";
    `);
  }
}
