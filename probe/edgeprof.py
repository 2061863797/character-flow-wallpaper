import numpy as np, sys
from PIL import Image
def prof(p,cx,cy):
    a=np.asarray(Image.open(p).convert('RGB')).astype(int)[:1440,:2560]
    c=a.reshape(90,16,320,8,3).max(axis=(1,3)); bl=(c[...,2]-c[...,0]).astype(float)
    ys,xs=np.mgrid[0:90,0:320]; X=xs*8+4; Y=ys*16+8
    R=np.hypot(X-cx,Y-cy); A=np.arctan2(Y-cy,X-cx)
    ok=(X<2112)&(Y>60)&(Y<1170)
    nb=72; sec=((A+np.pi)/(2*np.pi)*nb).astype(int)%nb
    rel=np.arange(-80,161,10); acc=np.zeros(len(rel)); cnt=np.zeros(len(rel)); edges=[]
    for k in range(nb):
        m=ok&(sec==k)&(bl>30)
        if m.sum()<3: continue
        re=np.percentile(R[m],97); edges.append(re)
        mm=ok&(sec==k)
        for j,r in enumerate(rel):
            sel=mm&(R>re-r-5)&(R<=re-r+5)
            if sel.sum(): acc[j]+=bl[sel].mean(); cnt[j]+=1
    e=np.array(edges)
    return rel,acc/np.maximum(cnt,1), np.std(np.diff(np.r_[e,e[:1]]))
for p in sys.argv[1:]:
    rel,v,j=prof(p,1288,653)
    print(p,'edge jump between 5deg sectors: %.1fpx'%j)
    print('  inward px:',' '.join(f'{r:>4d}' for r in rel))
    print('  blue     :',' '.join(f'{x:4.0f}' for x in v))
