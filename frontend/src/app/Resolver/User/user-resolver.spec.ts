import { TestBed } from '@angular/core/testing';
import { ResolveFn } from '@angular/router';
import { userResolver } from './user-resolver';
import { IUser } from '../../Interface/Auth/auth.interface';

describe('userResolver', () => {
  const executeResolver: ResolveFn<IUser | null> = (...resolverParameters) =>
    TestBed.runInInjectionContext(() => userResolver(...resolverParameters));

  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('should be created', () => {
    expect(executeResolver).toBeTruthy();
  });
});